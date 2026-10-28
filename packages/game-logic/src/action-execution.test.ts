import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from './test/game-test-helpers'
import { Result } from 'effect'
import { assert } from 'vite-plus/test'
import { applyDispatchEffects, dispatch } from './dispatch'
import { executeCommittedIntent } from './action-execution'
import { editPlayer } from './player/player-state'

function stateWithFundedVillage() {
	const board = createTestBoard(2)
	const at = { q_idx: 2, r_idx: 2 }
	requireTestValue(board[at.r_idx])[at.q_idx] = {
		...requireTestValue(requireTestValue(board[at.r_idx])[at.q_idx]),
		item: createTestVillage('barbarians')
	}
	const state = createTestGameState({ board, currentPlayerTribe: 'barbarians' })
	return {
		at,
		state: {
			...state,
			playerStates: editPlayer(state.playerStates, 'barbarians', (draft) => {
				draft.credit(50)
			})
		}
	}
}

describe('executeCommittedIntent', () => {
	it('commits dispatch effects before returning the next Match state', () => {
		const { state, at } = stateWithFundedVillage()
		const intent = {
			kind: 'tileAction',
			action: { kind: 'research', tech: 'climbing', at }
		} as const

		const committed = executeCommittedIntent(state, 'barbarians', intent)
		const manual = dispatch(state, 'barbarians', intent)

		expect(Result.isSuccess(committed)).toBe(true)
		assert(Result.isSuccess(committed))
		expect(Result.isSuccess(manual)).toBe(true)
		assert(Result.isSuccess(manual))
		expect(committed.success.nextState).toEqual(
			applyDispatchEffects(manual.success.nextState, manual.success.effects)
		)
		expect(committed.success.message).toBe(manual.success.message)
	})
})
