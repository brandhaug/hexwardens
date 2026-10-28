import { type UnitId } from '@hexwardens/game-logic/domains/unit'
import { type UnitStateRecord } from '@hexwardens/game-logic/unit-state-utils'
import {
	createTestUnit,
	createTestUnitState
} from '@hexwardens/game-logic/test/game-test-helpers'
import { type TileState } from '@hexwardens/game-logic/tile/tile'
import {
	unitCombatOverrides,
	unitDefeatTransitions,
	unitTransitions
} from './unit-transitions'

function requireUnitState(states: UnitStateRecord, id: UnitId) {
	const state = states[id]
	if (!state) {
		throw new Error(`Missing fixture unit state: ${id}`)
	}
	return state
}

function makeTile(): TileState {
	return {
		hex: { q: 0, r: 0, s: 0 },
		terrain: 'grass',
		item: null,
		unit: null,
		isMountain: false,
		obstacle: null
	}
}

function emptyBoard(size: number): TileState[][] {
	const board: TileState[][] = []
	for (let r = 0; r < size; r++) {
		const row: TileState[] = []
		for (let q = 0; q < size; q++) {
			row.push(makeTile())
		}
		board.push(row)
	}
	return board
}

function placeUnit(
	board: TileState[][],
	q_idx: number,
	r_idx: number,
	id: UnitId
): TileState[][] {
	const next = board.map((row) => [...row])
	const row = next[r_idx]
	const tile = row?.[q_idx]
	if (!row || !tile) {
		throw new Error('Expected unit placement tile')
	}
	row[q_idx] = {
		...tile,
		unit: createTestUnit('barbarians', 'caveman', id)
	}
	return next
}

describe('unitTransitions', () => {
	it('returns no transitions on first render (no previous board)', () => {
		const next = placeUnit(emptyBoard(3), 1, 1, 'unit_u1')
		expect(unitTransitions(null, next)).toEqual([])
	})

	it('returns no transitions when boards are identical', () => {
		const board = placeUnit(emptyBoard(3), 1, 1, 'unit_u1')
		expect(unitTransitions(board, board)).toEqual([])
	})

	it('emits a transition for a unit that moved tiles', () => {
		const prev = placeUnit(emptyBoard(3), 1, 1, 'unit_u1')
		const next = placeUnit(emptyBoard(3), 2, 1, 'unit_u1')
		expect(unitTransitions(prev, next)).toEqual([
			{
				unitId: 'unit_u1',
				from: { q_idx: 1, r_idx: 1 },
				to: { q_idx: 2, r_idx: 1 }
			}
		])
	})

	it('ignores units that only appear in the new board (spawns)', () => {
		const prev = emptyBoard(3)
		const next = placeUnit(emptyBoard(3), 1, 1, 'unit_u1')
		expect(unitTransitions(prev, next)).toEqual([])
	})

	it('ignores units that disappear (defeats)', () => {
		const prev = placeUnit(emptyBoard(3), 1, 1, 'unit_u1')
		const next = emptyBoard(3)
		expect(unitTransitions(prev, next)).toEqual([])
	})
})

describe('unitDefeatTransitions', () => {
	it('keeps enough data to render a defeated unit at its old tile', () => {
		const prev = placeUnit(emptyBoard(3), 1, 1, 'unit_u1')
		const next = emptyBoard(3)
		const unit = prev[1]?.[1]?.unit
		if (!unit) {
			throw new Error('Expected placed unit')
		}

		expect(unitDefeatTransitions(prev, next)).toEqual([
			{
				unit,
				position: { q_idx: 1, r_idx: 1 },
				terrain: 'grass',
				isMountain: false
			}
		])
	})
})

describe('unitCombatOverrides', () => {
	it('emits attack for an attacker spent by combat damage', () => {
		const attackerId = 'unit_attacker'
		const defenderId = 'unit_defender'
		const prev: UnitStateRecord = {
			[attackerId]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman', {
				mode: 'ready'
			}),
			[defenderId]: createTestUnitState({ q_idx: 2, r_idx: 1 }, 'caveman', {
				health: 10
			})
		}
		const next: UnitStateRecord = {
			[attackerId]: { ...requireUnitState(prev, attackerId), mode: 'acted' },
			[defenderId]: { ...requireUnitState(prev, defenderId), health: 4 }
		}

		expect(unitCombatOverrides(prev, next)).toEqual([
			{ unitId: attackerId, state: 'attack' },
			{ unitId: defenderId, state: 'defend' }
		])
	})

	it('does not treat non-combat mode changes as attacks', () => {
		const unitId = 'unit_worker'
		const prev: UnitStateRecord = {
			[unitId]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman', {
				mode: 'ready'
			})
		}
		const next: UnitStateRecord = {
			[unitId]: { ...requireUnitState(prev, unitId), mode: 'acted' }
		}

		expect(unitCombatOverrides(prev, next)).toEqual([])
	})

	it('emits defend for surviving units whose health dropped', () => {
		const defenderId = 'unit_defender'
		const prev: UnitStateRecord = {
			[defenderId]: createTestUnitState({ q_idx: 2, r_idx: 1 }, 'caveman', {
				health: 10
			})
		}
		const next: UnitStateRecord = {
			[defenderId]: { ...requireUnitState(prev, defenderId), health: 4 }
		}

		expect(unitCombatOverrides(prev, next)).toEqual([
			{ unitId: defenderId, state: 'defend' }
		])
	})

	it('skips units whose state is unchanged', () => {
		const unitId = 'unit_idle'
		const prev: UnitStateRecord = {
			[unitId]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman', {
				health: 10
			})
		}
		const next: UnitStateRecord = {
			[unitId]: { ...requireUnitState(prev, unitId) }
		}

		expect(unitCombatOverrides(prev, next)).toEqual([])
	})

	it('skips defeated units (no longer present in next states)', () => {
		const unitId = 'unit_dead'
		const prev: UnitStateRecord = {
			[unitId]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman', {
				health: 3
			})
		}
		const next: UnitStateRecord = {}

		expect(unitCombatOverrides(prev, next)).toEqual([])
	})

	// A counter-attacker (swung back and took damage) emits a single override
	// with attack precedence — attack better telegraphs combat engagement
	// than defend, and both share an override slot keyed by unitId.
	it('prefers attack over defend for a counter-attacking unit', () => {
		const counterAttackerId = 'unit_counter'
		const prev: UnitStateRecord = {
			[counterAttackerId]: createTestUnitState(
				{ q_idx: 1, r_idx: 1 },
				'caveman',
				{ mode: 'ready', health: 10 }
			)
		}
		const next: UnitStateRecord = {
			[counterAttackerId]: {
				...requireUnitState(prev, counterAttackerId),
				mode: 'acted',
				health: 4
			}
		}

		expect(unitCombatOverrides(prev, next)).toEqual([
			{ unitId: counterAttackerId, state: 'attack' }
		])
	})
})
