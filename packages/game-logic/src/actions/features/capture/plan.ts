import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { getVillageName } from '../../../domains/village-naming'
import { canUnitCapture } from '../../../validation/unit'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeCapture: WorldActionExecutor = (world, context, plan) => {
	const at = plan.intent.at
	const tribe = context.currentPlayerTribe
	const tile = world.tile(at)
	if (!tile) {
		return 'No tile at position'
	}
	if (tile.item?.type !== 'village' || !tile.unit) {
		return 'Cannot capture'
	}
	world.updateTile(at, {
		item: {
			...tile.item,
			captureSetup: { byTribe: tribe, turnInitiated: world.metadata().turn }
		}
	})
	world.updateUnit(tile.unit.id, { mode: 'acted' })
	return `Capture initiated at ${getVillageName(context.gameState, at) ?? 'the Village'}. Ownership flips at the start of next turn.`
}

export function previewCapture(context: ActionContext): ActionPreview | null {
	if (!isCaptureCandidate(context)) {
		return null
	}
	return {
		actionType: 'capture',
		intent: { kind: 'capture', at: context.selectedPosition },
		label: 'Capture Village',
		variant: 'destructive'
	}
}

export function planCapture(
	intent: ActionIntent & { kind: 'capture' },
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
			reason: { kind: 'invalidTarget', detail: 'No unit to capture with' }
		}
	}

	const unitState = gameState.units.unitStates[unit.id]
	if (unitState?.mode === 'moved' && !unit.stats.canCaptureAfterMove) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'unitNotReady',
				detail: 'Unit cannot capture after moving'
			}
		}
	}
	if (unitState?.mode === 'acted') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'unitNotReady',
				detail: 'Unit cannot capture after attacking'
			}
		}
	}
	if (unitState?.mode === 'retreat') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'unitNotReady',
				detail: 'Unit can only retreat-move'
			}
		}
	}

	if (tile.item?.type !== 'village') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Cannot capture village - invalid conditions'
			}
		}
	}

	return {
		kind: 'allowed',
		intent,
		cost: { gold: 0 },
		preview: {
			actionType: 'capture',
			intent,
			label: 'Capture Village',
			variant: 'destructive'
		}
	}
}

function isCaptureCandidate(context: ActionContext): boolean {
	const { selectedTile, currentPlayerTribe, gameState } = context
	const unit = selectedTile.unit
	if (!unit) {
		return false
	}
	const unitState = gameState.units.unitStates[unit.id]
	return (
		selectedTile.item?.type === 'village' &&
		unit.tribe === currentPlayerTribe &&
		selectedTile.item.tribe !== currentPlayerTribe &&
		canUnitCapture(unitState, unit)
	)
}

export function inspectCapture(
	context: ActionContext
): ActionInspection | null {
	if (
		context.selectedTile.unit?.tribe !== context.currentPlayerTribe ||
		context.selectedTile.item?.type !== 'village' ||
		context.selectedTile.item.tribe === context.currentPlayerTribe
	) {
		return null
	}
	return {
		intent: { kind: 'capture', at: context.selectedPosition },
		label: 'Capture village',
		outcome: 'Hold this tile until your next turn to take ownership.'
	}
}
