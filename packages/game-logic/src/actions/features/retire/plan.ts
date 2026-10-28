import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { hasTechPassive } from '../../../domains/tech'
import {
	getUnitDisplayName,
	isHeroUnitType,
	unitToUnitStats
} from '../../../domains/unit'
import { getPlayerState } from '../../../player/player-state'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

function retirementValue(unitType: keyof typeof unitToUnitStats): number {
	return Math.max(1, Math.floor(unitToUnitStats[unitType].cost / 2))
}

export const executeRetire: WorldActionExecutor = (world, context, plan) => {
	const tile = world.tile(plan.intent.at)
	if (!tile) {
		return 'No tile at position'
	}
	if (!tile.unit) {
		return 'No unit to retire'
	}
	const gold = retirementValue(tile.unit.type)
	world.removeUnit(tile.unit.id)
	world.editPlayer(context.currentPlayerTribe, (draft) => draft.credit(gold))
	return `${getUnitDisplayName(tile.unit.type)} retired for ${gold} gold.`
}

function retireLabel(unitType: keyof typeof unitToUnitStats): string {
	return `Retire ${getUnitDisplayName(unitType)} (+${retirementValue(unitType)} gold)`
}

export function previewRetire(context: ActionContext): ActionPreview | null {
	const { selectedTile, currentPlayerTribe, gameState } = context
	const unit = selectedTile.unit
	if (!unit || unit.tribe !== currentPlayerTribe) {
		return null
	}
	if (isHeroUnitType(unit.type)) {
		return null
	}

	const playerState = getPlayerState(gameState.playerStates, currentPlayerTribe)
	if (
		!playerState ||
		!hasTechPassive(playerState.researchedTechs, 'retire_unlock')
	) {
		return null
	}

	const unitState = gameState.units.unitStates[unit.id]
	if (unitState?.mode !== 'ready') {
		return null
	}

	return {
		actionType: 'retire',
		intent: { kind: 'retire', at: context.selectedPosition },
		label: retireLabel(unit.type),
		variant: 'secondary'
	}
}

export function planRetire(
	intent: ActionIntent & { kind: 'retire' },
	context: ActionContext
): ActionPlan {
	const { gameState, selectedPosition } = context
	const tile =
		gameState.units.board[selectedPosition.r_idx]?.[selectedPosition.q_idx]
	const unit = tile?.unit
	if (!unit) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'No unit to retire' }
		}
	}
	if (unit.tribe !== gameState.currentPlayerTribe) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'Cannot retire enemy units' }
		}
	}
	if (isHeroUnitType(unit.type)) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'Hero units cannot be retired' }
		}
	}

	const playerState = getPlayerState(
		gameState.playerStates,
		gameState.currentPlayerTribe
	)
	if (
		!playerState ||
		!hasTechPassive(playerState.researchedTechs, 'retire_unlock')
	) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'missingTech', tech: 'guild' }
		}
	}

	const unitState = gameState.units.unitStates[unit.id]
	if (unitState?.mode !== 'ready') {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'unitNotReady', detail: 'Unit must be ready to retire' }
		}
	}

	return {
		kind: 'allowed',
		intent,
		cost: { gold: 0 },
		preview: {
			actionType: 'retire',
			intent,
			label: retireLabel(unit.type),
			variant: 'secondary'
		}
	}
}

export function inspectRetire(context: ActionContext): ActionInspection | null {
	if (context.selectedTile.unit?.tribe !== context.currentPlayerTribe) {
		return null
	}
	return {
		intent: { kind: 'retire', at: context.selectedPosition },
		label: 'Retire',
		outcome: 'Remove this unit permanently and refund gold.'
	}
}
