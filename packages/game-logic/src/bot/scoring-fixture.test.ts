import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from '../test/game-test-helpers'
import { describe, expect, it } from 'vite-plus/test'
import { fixtureOf } from './scorers/scorer-test-helpers'

describe('buildScoringFixture', () => {
	it('splits units by tribe and indexes villages', () => {
		const board = createTestBoard(2)
		const barbarian = createTestUnit('barbarians', 'caveman')
		const rogues = createTestUnit('rogues', 'caveman')
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			unit: barbarian,
			item: createTestVillage('barbarians')
		}
		requireTestValue(board[0])[0] = {
			...requireTestValue(requireTestValue(board[0])[0]),
			unit: rogues,
			item: createTestVillage('rogues')
		}
		const state = createTestGameState({
			board,
			unitStates: {
				[barbarian.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman'),
				[rogues.id]: createTestUnitState({ q_idx: 0, r_idx: 0 }, 'caveman')
			}
		})

		const fixture = fixtureOf(state, 'barbarians')

		expect(fixture.friendlyUnits).toHaveLength(1)
		expect(requireTestValue(fixture.friendlyUnits[0]).unit.id).toBe(
			barbarian.id
		)
		expect(fixture.enemyUnits).toHaveLength(1)
		expect(requireTestValue(fixture.enemyUnits[0]).unit.id).toBe(rogues.id)

		expect(fixture.friendlyVillages).toEqual([{ q_idx: 2, r_idx: 2 }])
		expect(fixture.enemyVillages).toEqual([{ q_idx: 0, r_idx: 0 }])
	})

	it('enemiesWithin filters by distance from a position', () => {
		const board = createTestBoard(3)
		const rogues = createTestUnit('rogues', 'caveman')
		requireTestValue(board[3])[4] = {
			...requireTestValue(requireTestValue(board[3])[4]),
			unit: rogues
		}
		const state = createTestGameState({
			board,
			unitStates: {
				[rogues.id]: createTestUnitState({ q_idx: 4, r_idx: 3 }, 'caveman')
			}
		})

		const fixture = fixtureOf(state, 'barbarians')

		expect(fixture.enemiesWithin({ q_idx: 3, r_idx: 3 }, 1)).toHaveLength(1)
		expect(fixture.enemiesWithin({ q_idx: 0, r_idx: 0 }, 1)).toHaveLength(0)
	})

	it('candidateTiles returns tiles matching a predicate', () => {
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: { type: 'resource', value: 'apple' }
		}
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: { type: 'resource', value: 'berry' }
		}
		const state = createTestGameState({ board })
		const fixture = fixtureOf(state, 'barbarians')

		const resources = fixture.candidateTiles(
			(_, tile) => tile.item?.type === 'resource'
		)
		expect(resources).toHaveLength(2)
	})
})
