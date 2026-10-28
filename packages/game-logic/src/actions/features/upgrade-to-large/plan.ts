import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { awardControllingVillage } from '../../village-rewards'
import { capitalize } from 'lodash-es'
import { gameEventToCost, gameEventToVillageExperience } from '../../../game'
import { secondaryBuildingToMastery } from '../../../domains/secondary-building'
import { getPlayerState } from '../../../player/player-state'
import { canAfford } from '../../../validation/player'

import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeUpgradeToLarge: WorldActionExecutor = (
	world,
	context,
	plan
) => {
	const at = plan.intent.at
	const tribe = context.currentPlayerTribe
	const tile = world.tile(at)
	if (!tile) {
		return 'No tile at position'
	}
	if (tile.item?.type !== 'secondaryBuilding') {
		return 'Cannot upgrade here'
	}
	world.updateTile(at, { item: { ...tile.item, state: 'large' } })
	world.editPlayer(tribe, (draft) => draft.spend(plan.cost.gold))
	awardControllingVillage(
		world,
		at,
		tribe,
		gameEventToVillageExperience.building_upgraded
	)
	return `${capitalize(tile.item.value)} upgraded to Large!`
}

/**
 * Preview the "Upgrade to Large …" button on the action bar. Surfaces only
 * when the selected tile holds a tier-2 secondary in `built` state owned by
 * the current tribe, and the corresponding Path Mastery has been researched.
 */
export function previewUpgradeToLarge(
	context: ActionContext
): ActionPreview | null {
	const { selectedTile, currentPlayerTribe, gameState, isWithinVillageRange } =
		context
	const item = selectedTile.item
	if (
		item?.type !== 'secondaryBuilding' ||
		item.state !== 'built' ||
		item.tribe !== currentPlayerTribe ||
		!isWithinVillageRange
	) {
		return null
	}
	const player = getPlayerState(gameState.playerStates, currentPlayerTribe)
	const masteryTech = secondaryBuildingToMastery[item.value]
	if (!player || !player.researchedTechs.includes(masteryTech)) {
		return null
	}
	return {
		actionType: 'upgrade-to-large',
		intent: { kind: 'upgrade-to-large', at: context.selectedPosition },
		label: `Upgrade to Large ${capitalize(item.value)}`,
		variant: 'default'
	}
}

export function planUpgradeToLarge(
	intent: ActionIntent & { kind: 'upgrade-to-large' },
	context: ActionContext
): ActionPlan {
	const { selectedTile, currentPlayerTribe, gameState, isWithinVillageRange } =
		context
	const item = selectedTile.item
	if (item?.type !== 'secondaryBuilding') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Only secondary buildings can be upgraded to Large'
			}
		}
	}
	if (item.tribe !== currentPlayerTribe) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Cannot upgrade a building owned by another tribe'
			}
		}
	}
	if (item.state !== 'built') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: `${capitalize(item.value)} is already at Large tier`
			}
		}
	}
	if (!isWithinVillageRange) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Tile is outside any owned village range'
			}
		}
	}
	const masteryTech = secondaryBuildingToMastery[item.value]
	const player = getPlayerState(gameState.playerStates, currentPlayerTribe)
	if (!player || !player.researchedTechs.includes(masteryTech)) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'missingTech', tech: masteryTech }
		}
	}
	const cost = gameEventToCost.building_upgraded
	if (!canAfford(player, cost)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'insufficientFunds',
				required: cost,
				available: player.money
			}
		}
	}
	const preview = previewUpgradeToLarge(context)
	if (!preview) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Cannot upgrade this tile to Large'
			}
		}
	}
	return { kind: 'allowed', intent, cost: { gold: cost }, preview }
}

export function inspectUpgradeToLarge(
	context: ActionContext
): ActionInspection | null {
	if (
		context.selectedTile.item?.type !== 'secondaryBuilding' ||
		context.selectedTile.item.state !== 'built'
	) {
		return null
	}
	return {
		intent: { kind: 'upgrade-to-large', at: context.selectedPosition },
		label: 'Upgrade building',
		outcome: `Upgrade to Large and add ${gameEventToVillageExperience.building_upgraded} development to its village.`
	}
}
