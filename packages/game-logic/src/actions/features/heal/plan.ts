import { type ActionContext, type WorldActionExecutor } from '../../actions'
import {
	getEffectiveMaxHealth,
	getUnitDisplayName
} from '../../../domains/unit'
import { getPlayerState } from '../../../player/player-state'
import { canAfford } from '../../../validation/player'
import { canUnitHeal } from '../../../validation/unit'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

const HEAL_COST = 1

export const executeHeal: WorldActionExecutor = (world, context, plan) => {
	const tile = world.tile(plan.intent.at)
	if (!tile) {
		return 'No tile at position'
	}
	if (!tile.unit) {
		return 'No unit to heal'
	}
	const unit = world.unit(tile.unit.id)
	if (!unit) {
		return 'No unit state to heal'
	}
	const health = getEffectiveMaxHealth(unit.unit.type, unit.state)
	world.updateUnit(unit.unit.id, { health, mode: 'acted' })
	world.editPlayer(context.currentPlayerTribe, (draft) =>
		draft.spend(plan.cost.gold)
	)
	return `${getUnitDisplayName(unit.unit.type)} healed successfully!`
}

export function previewHeal(context: ActionContext): ActionPreview | null {
	const { selectedTile, currentPlayerTribe, gameState } = context
	const unit = selectedTile.unit
	if (!unit) {
		return null
	}
	const unitState = gameState.units.unitStates[unit.id]
	if (
		unit.tribe !== currentPlayerTribe ||
		!unitState ||
		unitState.health >= getEffectiveMaxHealth(unit.type, unitState) ||
		!canUnitHeal(unitState)
	) {
		return null
	}
	return {
		actionType: 'heal',
		intent: { kind: 'heal', at: context.selectedPosition },
		label: `Heal ${getUnitDisplayName(unit.type)}`,
		variant: 'default'
	}
}

export function planHeal(
	intent: ActionIntent & { kind: 'heal' },
	context: ActionContext
): ActionPlan {
	const { gameState, selectedPosition } = context
	const tile =
		gameState.units.board[selectedPosition.r_idx]?.[selectedPosition.q_idx]
	if (!tile?.unit) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidTarget', detail: 'No unit to heal' }
		}
	}
	const unit = tile.unit
	const unitState = gameState.units.unitStates[unit.id]
	if (!canUnitHeal(unitState)) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'unitNotReady', detail: 'Unit cannot heal' }
		}
	}
	const currentHealth = unitState.health
	const maxHealth = getEffectiveMaxHealth(unit.type, unitState)
	if (currentHealth >= maxHealth) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: `${getUnitDisplayName(unit.type)} is already at full health`
			}
		}
	}

	const player = getPlayerState(
		gameState.playerStates,
		gameState.currentPlayerTribe
	)
	const availableMoney = player?.money ?? 0
	if (!canAfford(player, HEAL_COST)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'insufficientFunds',
				required: HEAL_COST,
				available: availableMoney
			}
		}
	}

	return {
		kind: 'allowed',
		intent,
		cost: { gold: HEAL_COST },
		preview: {
			actionType: 'heal',
			intent,
			label: `Heal ${getUnitDisplayName(unit.type)}`,
			variant: 'default'
		}
	}
}

export function inspectHeal(context: ActionContext): ActionInspection | null {
	if (context.selectedTile.unit?.tribe !== context.currentPlayerTribe) {
		return null
	}
	return {
		intent: { kind: 'heal', at: context.selectedPosition },
		label: 'Heal',
		outcome: "Restore full health and spend this unit's action."
	}
}
