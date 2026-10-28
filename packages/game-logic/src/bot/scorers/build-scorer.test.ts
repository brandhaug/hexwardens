import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../../test/game-test-helpers'
import { primaryBuildings } from '../../domains/primary-building'
import { editPlayer } from '../../player/player-state'
import { scoreBuildActions } from './build-scorer'
import { fixtureOf } from './scorer-test-helpers'

describe('scoreBuildActions (Hexwardens roster)', () => {
	it('produces a build candidate for every surviving primary building type', () => {
		const board = createTestBoard(3)
		// Put a friendly village at the centre so neighbours sit inside its range.
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('barbarians', { range: 3 })
		}
		// Place each surviving primary on a tile within range — drives the loop
		// through every roster member to prove the scorer doesn't crash on any.
		const offsets: Array<[number, number]> = [
			[3, 2],
			[3, 4],
			[2, 3],
			[4, 3],
			[2, 4]
		]
		primaryBuildings.forEach((value, index) => {
			const [r, q] = requireTestValue(offsets[index])
			requireTestValue(board[r])[q] = {
				...requireTestValue(requireTestValue(board[r])[q]),
				item: { type: 'primaryBuilding', value, state: 'idle', tribe: null }
			}
		})
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}

		const candidates = scoreBuildActions(fixtureOf(state, 'barbarians'))

		expect(candidates).toHaveLength(primaryBuildings.length)
		for (const candidate of candidates) {
			expect(Number.isFinite(candidate.score)).toBe(true)
		}
	})
})
