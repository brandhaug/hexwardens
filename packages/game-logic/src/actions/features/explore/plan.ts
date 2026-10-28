import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { generateRuinsName } from '../../../domains/village-naming'
import { awardControllingVillage } from '../../village-rewards'
import { canUnitExplore } from '../../../validation/unit'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeExplore: WorldActionExecutor = (world, context, plan) => {
	const at = plan.intent.at
	const tribe = context.currentPlayerTribe
	const tile = world.tile(at)
	if (!tile) {
		return 'No tile at position'
	}
	if (!tile.unit || tile.item?.type !== 'ruins') {
		return 'Cannot explore'
	}
	world.updateTile(at, { item: null })
	world.updateUnit(tile.unit.id, { mode: 'acted' })
	let reward = 'Found mysterious treasure!'
	switch (tile.item.reward) {
		case 'money': {
			world.editPlayer(tribe, (draft) => draft.credit(10))
			reward = 'Found 10 gold!'
			break
		}
		case 'unit': {
			world.editPlayer(tribe, (draft) => draft.credit(5))
			reward = 'Found ancient treasure worth 5 gold!'
			break
		}
		case 'experience': {
			reward = awardControllingVillage(world, at, tribe, 3)
				? 'Village gained 3 experience!'
				: 'Found ancient knowledge, but no village to benefit!'
			break
		}
	}
	return `${generateRuinsName(world.metadata().seed, at)} explored! ${reward}`
}

export function previewExplore(context: ActionContext): ActionPreview | null {
	const { selectedTile, currentPlayerTribe, gameState } = context
	const unit = selectedTile.unit
	if (!unit) {
		return null
	}
	const unitState = gameState.units.unitStates[unit.id]
	if (
		selectedTile.item?.type !== 'ruins' ||
		unit.tribe !== currentPlayerTribe ||
		!canUnitExplore(unitState)
	) {
		return null
	}
	return {
		actionType: 'explore',
		intent: { kind: 'explore', at: context.selectedPosition },
		label: 'Explore Ruins',
		variant: 'default'
	}
}

export function planExplore(
	intent: ActionIntent & { kind: 'explore' },
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
			reason: { kind: 'invalidTarget', detail: 'No unit to explore with' }
		}
	}
	const unitState = gameState.units.unitStates[unit.id]
	if (unitState?.mode === 'moved') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'unitNotReady',
				detail: 'Unit cannot explore after moving'
			}
		}
	}
	if (unitState?.mode === 'acted') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'unitNotReady',
				detail: 'Unit cannot explore after attacking'
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
	if (tile.item?.type !== 'ruins') {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Cannot explore - no ruins or no unit present'
			}
		}
	}

	return {
		kind: 'allowed',
		intent,
		cost: { gold: 0 },
		preview: {
			actionType: 'explore',
			intent,
			label: 'Explore Ruins',
			variant: 'default'
		}
	}
}

export function inspectExplore(
	context: ActionContext
): ActionInspection | null {
	if (
		context.selectedTile.unit?.tribe !== context.currentPlayerTribe ||
		context.selectedTile.item?.type !== 'ruins'
	) {
		return null
	}
	return {
		intent: { kind: 'explore', at: context.selectedPosition },
		label: 'Explore ruins',
		outcome: 'Consume these ruins for a random reward.'
	}
}
