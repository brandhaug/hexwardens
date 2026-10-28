import { type ActionContext, type WorldActionExecutor } from '../../actions'
import {
	getEffectiveMaxHealth,
	getUnitDisplayName
} from '../../../domains/unit'
import { canUnitRecover } from '../../../validation/unit'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeRecover: WorldActionExecutor = (world, context, plan) => {
	const tile = world.tile(plan.intent.at)
	if (!tile) {
		return 'No tile at position'
	}
	if (!tile.unit) {
		return 'No unit to recover'
	}
	const unit = world.unit(tile.unit.id)
	if (!unit) {
		return 'Unit has no state'
	}
	const max = getEffectiveMaxHealth(unit.unit.type, unit.state)
	const health = Math.min(
		max,
		unit.state.health + (context.isWithinVillageRange ? 8 : 4)
	)
	world.updateUnit(unit.unit.id, { health, mode: 'acted' })
	return `${getUnitDisplayName(unit.unit.type)} recovers (+${health - unit.state.health} HP)`
}

export function previewRecover(context: ActionContext): ActionPreview | null {
	const { selectedTile, currentPlayerTribe, gameState } = context
	const unit = selectedTile.unit
	if (!unit || unit.tribe !== currentPlayerTribe) {
		return null
	}
	const unitState = gameState.units.unitStates[unit.id]
	if (!canUnitRecover(unitState)) {
		return null
	}
	const maxHealth = getEffectiveMaxHealth(unit.type, unitState)
	if (unitState.health >= maxHealth) {
		return null
	}
	return {
		actionType: 'recover',
		intent: { kind: 'recover', at: context.selectedPosition },
		label: `Recover ${getUnitDisplayName(unit.type)}`,
		variant: 'default'
	}
}

export function planRecover(
	intent: ActionIntent & { kind: 'recover' },
	context: ActionContext
): ActionPlan {
	const { gameState, selectedPosition, currentPlayerTribe } = context
	const tile =
		gameState.units.board[selectedPosition.r_idx]?.[selectedPosition.q_idx]
	if (!tile?.unit) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'No unit to recover' }
		}
	}
	const unit = tile.unit
	if (unit.tribe !== currentPlayerTribe) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'Cannot recover an enemy unit' }
		}
	}
	const unitState = gameState.units.unitStates[unit.id]
	if (!unitState) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'Unit has no state' }
		}
	}
	if (!canUnitRecover(unitState)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'unitNotReady',
				detail: 'Unit has already acted this turn'
			}
		}
	}
	const maxHealth = getEffectiveMaxHealth(unit.type, unitState)
	if (unitState.health >= maxHealth) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: `${getUnitDisplayName(unit.type)} is already at full health`
			}
		}
	}
	return {
		kind: 'allowed',
		intent,
		cost: { gold: 0 },
		preview: {
			actionType: 'recover',
			intent,
			label: `Recover ${getUnitDisplayName(unit.type)}`,
			variant: 'default'
		}
	}
}

export function inspectRecover(
	context: ActionContext
): ActionInspection | null {
	if (context.selectedTile.unit?.tribe !== context.currentPlayerTribe) {
		return null
	}
	return {
		intent: { kind: 'recover', at: context.selectedPosition },
		label: 'Recover',
		outcome: "Recover health without spending gold; uses this unit's action."
	}
}
