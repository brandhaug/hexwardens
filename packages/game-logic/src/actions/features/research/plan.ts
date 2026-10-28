import { type ActionContext, type WorldActionExecutor } from '../../actions'
import {
	canResearchTech,
	getTechDisplayName,
	getAvailableTechs,
	getTechResearchCost,
	techTree,
	tribeToAlignedTechs,
	type Tech
} from '../../../domains/tech'
import { findVillagesByTribe } from '../../../domains/village'
import { getPlayerState } from '../../../player/player-state'
import { canAfford } from '../../../validation/player'
import {
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeResearch: WorldActionExecutor = (world, context, plan) => {
	const { intent } = plan
	if (intent.kind !== 'research') {
		return 'Invalid research intent'
	}
	if (!world.tile(intent.at)) {
		return 'No tile at position'
	}
	const turns = techTree[intent.tech].turnsToResearch
	world.editPlayer(context.currentPlayerTribe, (draft) => {
		draft.spend(plan.cost.gold)
		draft.startResearch(intent.tech, turns)
		if (turns === 0) {
			draft.completeResearch()
		}
	})
	return turns === 0
		? `${getTechDisplayName(intent.tech)} researched!`
		: `Started researching ${getTechDisplayName(intent.tech)} (${turns} turn${turns > 1 ? 's' : ''} remaining)`
}

export function previewResearch(context: ActionContext): ActionPreview[] {
	const { selectedTile, currentPlayerTribe, gameState } = context

	if (
		selectedTile.item?.type !== 'village' ||
		selectedTile.item.tribe !== currentPlayerTribe
	) {
		return []
	}

	const playerState = getPlayerState(gameState.playerStates, currentPlayerTribe)
	if (!playerState) {
		return []
	}
	if (playerState.researchInProgress) {
		return []
	}

	const previews: ActionPreview[] = []
	const availableTechs = getAvailableTechs(playerState.researchedTechs)
	const alignedTechs = new Set(tribeToAlignedTechs[currentPlayerTribe])
	const ownedVillages = findVillagesByTribe(
		gameState.units.board,
		currentPlayerTribe
	).length
	for (const tech of availableTechs) {
		const node = techTree[tech]
		const cost = costForTech(tech, ownedVillages)
		const turnsLabel =
			node.turnsToResearch > 0
				? `, ${node.turnsToResearch} turn${node.turnsToResearch > 1 ? 's' : ''}`
				: ''
		const isAligned = alignedTechs.has(tech)
		const alignedLabel = isAligned ? ' ★' : ''
		previews.push({
			actionType: `research-${tech}`,
			intent: { kind: 'research', at: context.selectedPosition, tech },
			label: `Research ${getTechDisplayName(tech)} (${cost} gold${turnsLabel})${alignedLabel}`,
			variant: 'secondary'
		})
	}
	return previews
}

export function planResearch(
	intent: ActionIntent & { kind: 'research' },
	context: ActionContext
): ActionPlan {
	const { gameState } = context
	const tribe = gameState.currentPlayerTribe
	const playerState = getPlayerState(gameState.playerStates, tribe)
	if (!playerState) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidIntent', detail: 'Player state not found' }
		}
	}

	if (playerState.researchInProgress) {
		return { kind: 'denied', intent, reason: { kind: 'researchInProgress' } }
	}

	if (!canResearchTech(intent.tech, playerState.researchedTechs)) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'missingTech', tech: intent.tech }
		}
	}

	const ownedVillages = findVillagesByTribe(gameState.units.board, tribe).length
	const cost = costForTech(intent.tech, ownedVillages)
	const availableMoney = playerState.money
	if (!canAfford(playerState, cost)) {
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

	return {
		kind: 'allowed',
		intent,
		cost: { gold: cost },
		preview: {
			actionType: `research-${intent.tech}`,
			intent,
			label: `Research ${getTechDisplayName(intent.tech)}`,
			variant: 'secondary'
		}
	}
}

function costForTech(tech: Tech, ownedVillages: number): number {
	return getTechResearchCost(tech, ownedVillages)
}
