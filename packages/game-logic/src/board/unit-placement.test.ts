import { type Unit } from '../domains/unit'
import {
	createTestBoard,
	createTestUnit,
	createTestUnitState
} from '../test/game-test-helpers'
import { type UnitStateRecord } from '../unit-state-utils'
import { updateTile, type TileGrid } from '../tile/tile'
import { type BoardPosition } from './position'
import {
	assertBoardUnitStatesConsistency,
	BoardUnitInvariantError,
	moveUnit,
	placeUnit,
	removeUnit
} from './unit-placement'

function seed(pos: BoardPosition, unit: Unit) {
	const board = updateTile(createTestBoard(2), pos, { unit })
	const unitStates: UnitStateRecord = {
		[unit.id]: createTestUnitState(pos, unit.type)
	}
	return { board, unitStates }
}

describe('placeUnit', () => {
	it('adds the unit to the tile and creates a matching UnitState', () => {
		const board = createTestBoard(2)
		const unit = createTestUnit('barbarians', 'caveman')
		const pos: BoardPosition = { q_idx: 2, r_idx: 2 }

		const result = placeUnit(
			board,
			{},
			pos,
			unit,
			createTestUnitState(pos, unit.type)
		)

		expect(result.board[2]?.[2]?.unit).toEqual(unit)
		expect(result.unitStates[unit.id]).toBeDefined()
		assertBoardUnitStatesConsistency(result.board, result.unitStates)
	})

	it('throws when the tile already holds a unit', () => {
		const existing = createTestUnit('barbarians', 'caveman')
		const { board, unitStates } = seed({ q_idx: 2, r_idx: 2 }, existing)
		const intruder = createTestUnit('rogues', 'caveman')

		expect(() =>
			placeUnit(
				board,
				unitStates,
				{ q_idx: 2, r_idx: 2 },
				intruder,
				createTestUnitState({ q_idx: 2, r_idx: 2 }, intruder.type)
			)
		).toThrow(BoardUnitInvariantError)
	})

	it('throws when state.position does not match tile', () => {
		const board = createTestBoard(2)
		const unit = createTestUnit('barbarians', 'caveman')

		expect(() =>
			placeUnit(
				board,
				{},
				{ q_idx: 2, r_idx: 2 },
				unit,
				createTestUnitState({ q_idx: 0, r_idx: 0 }, unit.type)
			)
		).toThrow(BoardUnitInvariantError)
	})
})

describe('removeUnit', () => {
	it('clears the tile and drops the UnitState', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos: BoardPosition = { q_idx: 2, r_idx: 2 }
		const { board, unitStates } = seed(pos, unit)

		const result = removeUnit(board, unitStates, unit.id)

		expect(result.board[2]?.[2]?.unit).toBeNull()
		expect(result.unitStates[unit.id]).toBeUndefined()
		assertBoardUnitStatesConsistency(result.board, result.unitStates)
	})

	it('throws when UnitState is missing', () => {
		const board = createTestBoard(2)
		expect(() => removeUnit(board, {}, 'unit_missing')).toThrow(
			BoardUnitInvariantError
		)
	})

	it('throws when the tile disagrees with the UnitState position', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos: BoardPosition = { q_idx: 2, r_idx: 2 }
		const { unitStates } = seed(pos, unit)
		const driftedBoard = updateTile(createTestBoard(2), pos, { unit: null })

		expect(() => removeUnit(driftedBoard, unitStates, unit.id)).toThrow(
			BoardUnitInvariantError
		)
	})
})

describe('moveUnit', () => {
	it('clears the source tile and occupies the destination', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const from: BoardPosition = { q_idx: 2, r_idx: 2 }
		const to: BoardPosition = { q_idx: 3, r_idx: 2 }
		const { board, unitStates } = seed(from, unit)

		const result = moveUnit(board, unitStates, unit.id, to)

		expect(result.board[from.r_idx]?.[from.q_idx]?.unit).toBeNull()
		expect(result.board[to.r_idx]?.[to.q_idx]?.unit).toEqual(unit)
		expect(result.unitStates[unit.id]?.position).toEqual(to)
		assertBoardUnitStatesConsistency(result.board, result.unitStates)
	})

	it('is a no-op when from and to match', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos: BoardPosition = { q_idx: 2, r_idx: 2 }
		const { board, unitStates } = seed(pos, unit)

		const result = moveUnit(board, unitStates, unit.id, pos)

		expect(result.board).toBe(board)
		expect(result.unitStates).toBe(unitStates)
	})

	it('throws when destination is already occupied', () => {
		const a = createTestUnit('barbarians', 'caveman')
		const b = createTestUnit('rogues', 'caveman')
		const aPos: BoardPosition = { q_idx: 2, r_idx: 2 }
		const bPos: BoardPosition = { q_idx: 3, r_idx: 2 }
		let board: TileGrid = createTestBoard(2)
		board = updateTile(board, aPos, { unit: a })
		board = updateTile(board, bPos, { unit: b })
		const unitStates: UnitStateRecord = {
			[a.id]: createTestUnitState(aPos, a.type),
			[b.id]: createTestUnitState(bPos, b.type)
		}

		expect(() => moveUnit(board, unitStates, a.id, bPos)).toThrow(
			BoardUnitInvariantError
		)
	})
})

describe('assertBoardUnitStatesConsistency', () => {
	it('passes on an empty board', () => {
		expect(() =>
			assertBoardUnitStatesConsistency(createTestBoard(2), {})
		).not.toThrow()
	})

	it('catches an orphaned UnitState', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, unit.type)
		}
		expect(() =>
			assertBoardUnitStatesConsistency(createTestBoard(2), unitStates)
		).toThrow(BoardUnitInvariantError)
	})

	it('catches a unit with no UnitState', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const board = updateTile(
			createTestBoard(2),
			{ q_idx: 2, r_idx: 2 },
			{
				unit
			}
		)
		expect(() => assertBoardUnitStatesConsistency(board, {})).toThrow(
			BoardUnitInvariantError
		)
	})

	it('catches a position mismatch', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const board = updateTile(
			createTestBoard(2),
			{ q_idx: 2, r_idx: 2 },
			{
				unit
			}
		)
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState({ q_idx: 0, r_idx: 0 }, unit.type)
		}
		expect(() => assertBoardUnitStatesConsistency(board, unitStates)).toThrow(
			BoardUnitInvariantError
		)
	})
})
