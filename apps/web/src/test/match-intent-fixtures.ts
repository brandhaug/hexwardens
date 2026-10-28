import { Result } from 'effect'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { dispatch, type Intent } from '@hexwardens/game-logic/dispatch'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'

/**
 * Test fixtures for driving MatchClient adapters with real engine intents.
 * Both adapter test suites need "a move the engine accepts" and "a move the
 * engine rejects" against a freshly-initialized match state; brute-forcing
 * candidates through the pure `dispatch` keeps the fixtures free of hex-math
 * assumptions.
 */

function tribeUnitPositions(
	state: GameState,
	tribe: Tribe
): readonly BoardPosition[] {
	const positions: BoardPosition[] = []
	state.units.board.forEach((row, r_idx) => {
		row.forEach((tile, q_idx) => {
			if (tile?.unit?.tribe === tribe) {
				positions.push({ r_idx, q_idx })
			}
		})
	})
	return positions
}

/**
 * First move Intent the engine accepts for `tribe`, found by probing every
 * board position as a destination for each of the tribe's units. `dispatch`
 * is pure, so probing never mutates `state`.
 */
export function findLegalMove(state: GameState, tribe: Tribe): Intent {
	for (const from of tribeUnitPositions(state, tribe)) {
		for (let r_idx = 0; r_idx < state.units.board.length; r_idx++) {
			const row = state.units.board[r_idx]
			if (!row) {
				continue
			}
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				// The client adapter represents fogged tiles and board holes as null.
				if (!row[q_idx]) {
					continue
				}
				const intent: Intent = {
					kind: 'move',
					from,
					to: { r_idx, q_idx }
				}
				if (Result.isSuccess(dispatch(state, tribe, intent))) {
					return intent
				}
			}
		}
	}
	throw new Error(`No legal move found for ${tribe}`)
}

/**
 * A move Intent the engine is guaranteed to reject: it originates from a
 * tile that holds no unit at all.
 */
export function findIllegalMove(state: GameState): Intent {
	for (let r_idx = 0; r_idx < state.units.board.length; r_idx++) {
		const row = state.units.board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			if (tile?.unit === null) {
				const from = { r_idx, q_idx }
				return { kind: 'move', from, to: from }
			}
		}
	}
	throw new Error('No unit-free tile found to build an illegal move')
}
