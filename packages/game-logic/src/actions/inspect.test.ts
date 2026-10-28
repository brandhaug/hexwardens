import { inspectTileActions } from './inspect'
import { Board } from '../board/board'
import {
	createTestBoard,
	createTestGameState,
	createTestVillage,
	createTestUnit,
	createTestUnitState
} from '../test/game-test-helpers'

// Failure cases: unavailable options disappear; denial disagrees with planner;
// inspection mutates state or reveals a stored random reward; enemy unit actions leak.
describe('tile action inspection', () => {
	const at = { q_idx: 2, r_idx: 2 }

	it('keeps a gated harvest visible with its actual denial', () => {
		const board = Board.from(createTestBoard(2))
			.update({ q_idx: 1, r_idx: 2 }, { item: createTestVillage('barbarians') })
			.update(at, { item: { type: 'resource', value: 'pearl' } }).tiles
		const state = createTestGameState({ board })
		const before = structuredClone(state)
		const option = inspectTileActions(state, 'barbarians', at).find(
			(entry) => entry.plan.intent.kind === 'collect'
		)
		expect(option?.plan.kind).toBe('denied')
		expect(option?.explanation).toContain('Research')
		expect(state).toEqual(before)
	})

	it('describes ruins as uncertain without publishing their stored reward', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const board = Board.from(createTestBoard(2)).update(at, {
			unit,
			item: { type: 'ruins', reward: 'money' }
		}).tiles
		const state = createTestGameState({
			board,
			unitStates: { [unit.id]: createTestUnitState(at, unit.type) }
		})
		const option = inspectTileActions(state, 'barbarians', at).find(
			(entry) => entry.plan.intent.kind === 'explore'
		)
		expect(option?.explanation).toContain('random')
		expect(option?.explanation).not.toContain('money')
	})

	it('does not offer commands for an enemy unit', () => {
		const unit = createTestUnit('rogues', 'caveman')
		const board = Board.from(createTestBoard(2)).update(at, { unit }).tiles
		const state = createTestGameState({ board })
		expect(inspectTileActions(state, 'barbarians', at)).toEqual([])
	})
})
