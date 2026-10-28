import { getEffectiveUnitStatsForTerrain } from '@hexwardens/game-logic/domains/unit'
import { createActionPlanner } from '@hexwardens/game-logic/actions/engine'
import { type ActionIntent } from '@hexwardens/game-logic/actions/intent'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { getTechDisplayName } from '@hexwardens/game-logic/domains/tech'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'

export function actionDockMessage(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition | null
): string {
	if (state.isGameOver) {
		return 'This match has ended.'
	}
	if (state.currentPlayerTribe !== tribe) {
		return 'Waiting for the other tribe.'
	}
	if (!at) {
		return 'Select a tile to command.'
	}
	const tile = state.units.board[at.r_idx]?.[at.q_idx]
	if (!tile) {
		return 'Select an explored tile.'
	}
	if (tile.unit?.tribe === tribe) {
		const mode = state.units.unitStates[tile.unit.id]?.mode
		if (mode === 'acted') {
			return 'This unit is done for now. Ready next turn.'
		}
		if (mode === 'retreat') {
			return 'This unit can retreat. Select a reachable tile.'
		}
		if (mode === 'moved') {
			if (
				!getEffectiveUnitStatsForTerrain(tile.unit.type, tile.terrain)
					.canAttackAfterMove
			) {
				return 'This unit cannot attack after moving. Ready next turn.'
			}
			return 'This unit has moved. Select a target in range or end the turn.'
		}
		return 'Select a reachable tile to move or an enemy in range to attack.'
	}
	let intent: ActionIntent | null = null
	if (tile.item?.type === 'village' && tile.item.tribe === tribe) {
		intent = { kind: 'train', at, unit: 'caveman' }
	}
	if (tile.item?.type === 'resource') {
		intent = { kind: 'collect', at }
	}
	if (tile.item?.type === 'primaryBuilding') {
		intent = { kind: 'build', at }
	}
	if (intent) {
		const plan = createActionPlanner(state, tribe, at).plan(intent)
		if (plan.kind === 'denied') {
			const { reason } = plan
			if (reason.kind === 'insufficientFunds') {
				return `Need ${reason.required} gold. You have ${reason.available}.`
			}
			if (reason.kind === 'missingTech') {
				return `Research ${getTechDisplayName(reason.tech)} first.`
			}
			if (reason.kind === 'researchInProgress') {
				return 'Research is already in progress.'
			}
			return reason.detail
		}
	}
	if (tile.unit) {
		return 'Select one of your units to give orders.'
	}
	return 'No actions here. Select one of your units or villages.'
}
