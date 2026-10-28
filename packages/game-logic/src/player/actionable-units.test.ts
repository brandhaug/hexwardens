import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	setUnitAt,
	withUnits
} from '../test/game-test-helpers'
import { type BoardPosition } from '../board/position'
import { type UnitId, type UnitMode, type UnitType } from '../domains/unit'

import { type UnitStateRecord } from '../unit-state-utils'
import { selectActionableUnits } from './actionable-units'

function placeUnit(
	board: ReturnType<typeof createTestBoard>,
	unitStates: UnitStateRecord,
	at: BoardPosition,
	id: UnitId,
	type: UnitType,
	mode: UnitMode
) {
	const unit = createTestUnit('barbarians', type, id)
	setUnitAt(board, at, unit)
	return {
		unit,
		unitStates: {
			...unitStates,
			[id]: createTestUnitState(at, type, { mode })
		}
	}
}

describe('selectActionableUnits', () => {
	it('returns an empty list when the tribe has no units', () => {
		const state = createTestGameState()
		expect(selectActionableUnits(state, 'barbarians')).toEqual([])
	})

	it('includes a ready unit owned by the tribe', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		const { unit, unitStates } = placeUnit(
			board,
			{},
			at,
			'unit_a',
			'caveman',
			'ready'
		)
		const state = withUnits(createTestGameState(), { board, unitStates })

		const actionable = selectActionableUnits(state, 'barbarians')
		expect(actionable).toHaveLength(1)
		expect(requireTestValue(actionable[0]).unit.id).toBe(unit.id)
		expect(requireTestValue(actionable[0]).position).toEqual(at)
	})

	it('excludes a unit whose mode is acted', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		const { unitStates } = placeUnit(
			board,
			{},
			at,
			'unit_a',
			'caveman',
			'acted'
		)
		const state = withUnits(createTestGameState(), { board, unitStates })

		expect(selectActionableUnits(state, 'barbarians')).toEqual([])
	})

	it('includes a retreating unit because it can still move', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		const { unitStates } = placeUnit(
			board,
			{},
			at,
			'unit_a',
			'caveman',
			'retreat'
		)
		const state = withUnits(createTestGameState(), { board, unitStates })

		expect(selectActionableUnits(state, 'barbarians')).toHaveLength(1)
	})

	it('includes a moved unit that can still attack after moving', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		// Cavemen have canAttackAfterMove: true.
		const { unitStates } = placeUnit(
			board,
			{},
			at,
			'unit_a',
			'caveman',
			'moved'
		)
		const state = withUnits(createTestGameState(), { board, unitStates })

		expect(selectActionableUnits(state, 'barbarians')).toHaveLength(1)
	})

	it('excludes a moved unit that cannot attack after moving', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		// Guards have canAttackAfterMove: false (defense unit).
		const { unitStates } = placeUnit(board, {}, at, 'unit_a', 'guard', 'moved')
		const state = withUnits(createTestGameState(), { board, unitStates })

		expect(selectActionableUnits(state, 'barbarians')).toEqual([])
	})

	it('excludes units owned by other tribes', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		const enemy = createTestUnit('rogues', 'caveman', 'unit_enemy')
		setUnitAt(board, at, enemy)
		const state = withUnits(createTestGameState(), {
			board,
			unitStates: {
				[enemy.id]: createTestUnitState(at, 'caveman', { mode: 'ready' })
			}
		})

		expect(selectActionableUnits(state, 'barbarians')).toEqual([])
	})

	it('returns units in ascending unit-id order for stable cycling', () => {
		const board = createTestBoard(3)
		let unitStates: UnitStateRecord = {}
		const positionA: BoardPosition = { q_idx: 1, r_idx: 1 }
		const positionB: BoardPosition = { q_idx: 2, r_idx: 1 }
		const positionC: BoardPosition = { q_idx: 1, r_idx: 2 }

		;({ unitStates } = placeUnit(
			board,
			unitStates,
			positionB,
			'unit_2',
			'caveman',
			'ready'
		))
		;({ unitStates } = placeUnit(
			board,
			unitStates,
			positionA,
			'unit_10',
			'caveman',
			'ready'
		))
		;({ unitStates } = placeUnit(
			board,
			unitStates,
			positionC,
			'unit_1',
			'caveman',
			'ready'
		))

		const state = withUnits(createTestGameState(), { board, unitStates })
		const actionable = selectActionableUnits(state, 'barbarians')

		expect(actionable.map((entry) => entry.unit.id)).toEqual([
			'unit_1',
			'unit_2',
			'unit_10'
		])
	})

	it('throws when a board unit is missing its UnitState', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 1, r_idx: 1 }
		const orphan = createTestUnit('barbarians', 'caveman', 'unit_orphan')
		setUnitAt(board, at, orphan)
		const state = withUnits(createTestGameState(), {
			board,
			// Intentionally omit unitState for the orphan.
			unitStates: {}
		})

		expect(() => selectActionableUnits(state, 'barbarians')).toThrow(
			/Board\/unitStates invariant violated/
		)
	})
})
