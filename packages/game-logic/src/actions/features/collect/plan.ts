import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { awardControllingVillage } from '../../village-rewards'
import { gameEventToCost, gameEventToVillageExperience } from '../../../game'
import { getPlayerState } from '../../../player/player-state'
import { canAfford } from '../../../validation/player'
import { hasResearchedTech, type Tech } from '../../../domains/tech'
import { type ResourceValue } from '../../../domains/resource'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

const resourceRequiredTech: Partial<Record<ResourceValue, Tech>> = {
	apple: 'fruit_harvesting',
	leather: 'meat_harvesting',
	pearl: 'clam_harvesting',
	granite: 'cheese',
	gem: 'gem'
}

export const executeCollect: WorldActionExecutor = (world, context, plan) => {
	const at = plan.intent.at
	const tribe = context.currentPlayerTribe
	const tile = world.tile(at)
	if (!tile) {
		return 'No tile at position'
	}
	if (tile.item?.type !== 'resource') {
		return 'No resource to collect'
	}
	world.updateTile(at, { item: null })
	world.editPlayer(tribe, (draft) => draft.spend(plan.cost.gold))
	awardControllingVillage(
		world,
		at,
		tribe,
		gameEventToVillageExperience.resource_collected
	)
	return `Collected ${tile.item.value}!`
}

function missingHarvestingTech(
	resource: ResourceValue,
	researchedTechs: readonly Tech[]
): Tech | null {
	const required = resourceRequiredTech[resource]
	if (!required) {
		return null
	}
	return hasResearchedTech(researchedTechs, required) ? null : required
}

export function previewCollect(context: ActionContext): ActionPreview | null {
	const { selectedTile, isWithinVillageRange, gameState, currentPlayerTribe } =
		context
	if (selectedTile.item?.type !== 'resource' || !isWithinVillageRange) {
		return null
	}
	const player = getPlayerState(gameState.playerStates, currentPlayerTribe)
	const techs = player?.researchedTechs ?? []
	if (missingHarvestingTech(selectedTile.item.value, techs)) {
		return null
	}
	return {
		actionType: 'collect',
		intent: { kind: 'collect', at: context.selectedPosition },
		label: `Collect ${selectedTile.item.value}`,
		variant: 'default'
	}
}

export function planCollect(
	intent: ActionIntent & { kind: 'collect' },
	context: ActionContext
): ActionPlan {
	const { gameState, selectedPosition } = context
	const tile =
		gameState.units.board[selectedPosition.r_idx]?.[selectedPosition.q_idx]

	if (tile?.item?.type !== 'resource') {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'No resource to collect' }
		}
	}

	const cost = gameEventToCost.resource_collected
	const player = getPlayerState(
		gameState.playerStates,
		gameState.currentPlayerTribe
	)
	const availableMoney = player?.money ?? 0
	if (!canAfford(player, cost)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'insufficientFunds',
				required: cost,
				available: availableMoney
			}
		}
	}

	const missingTech = missingHarvestingTech(
		tile.item.value,
		player?.researchedTechs ?? []
	)
	if (missingTech) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'missingTech', tech: missingTech }
		}
	}

	const preview = previewCollect(context)
	if (!preview) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'noActionAvailable',
				detail: 'Collect not available on this tile'
			}
		}
	}

	return { kind: 'allowed', intent, cost: { gold: cost }, preview }
}

export function inspectCollect(
	context: ActionContext
): ActionInspection | null {
	if (context.selectedTile.item?.type !== 'resource') {
		return null
	}
	return {
		intent: { kind: 'collect', at: context.selectedPosition },
		label: 'Collect resource',
		outcome: `Consume the resource and add ${gameEventToVillageExperience.resource_collected} development to its village.`
	}
}
