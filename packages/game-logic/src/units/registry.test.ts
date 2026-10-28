import {
	requireTestValue,
	createTestBoard,
	createTestUnit,
	createTestUnitState
} from '../test/game-test-helpers'
import { assertBoardUnitStatesConsistency } from '../board/unit-placement'
import { type Unit } from '../domains/unit'
import {
	mapUnitStates,
	occupiedTiles,
	tileAt,
	trainUnit,
	unitsLow,
	type UnitRegistry
} from './registry'

function seedRegistry(
	units: Array<{ unit: Unit; pos: { q_idx: number; r_idx: number } }> = []
): UnitRegistry {
	let reg: UnitRegistry = {
		board: createTestBoard(3),
		unitStates: {}
	}
	for (const { unit, pos } of units) {
		reg = unitsLow.spawn(reg, pos, unit, createTestUnitState(pos, unit.type))
	}
	return reg
}

describe('trainUnit', () => {
	it('spawns a unit on the tile with UnitState defaults', () => {
		const reg: UnitRegistry = {
			board: createTestBoard(3),
			unitStates: {}
		}
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 3, r_idx: 3 }

		const next = trainUnit(reg, unit, pos)

		expect(next.board[pos.r_idx]?.[pos.q_idx]?.unit).toEqual(unit)
		const state = next.unitStates[unit.id]
		expect(state).toBeDefined()
		assert(state)
		expect(state.position).toEqual(pos)
		expect(state.mode).toBe('ready')
		expect(state.health).toBe(unit.stats.health)
		expect(state.level).toBe(1)
		expect(state.kills).toBe(0)
		expect(state.killsThisTurn).toBe(0)
		expect(state.debuffs).toEqual([])
		expect(state.veterancyBonusAtk).toBe(0)
		expect(state.veterancyBonusHp).toBe(0)
		expect(state.hasBeenAttackedThisTurn).toBe(false)
		assertBoardUnitStatesConsistency(next.board, next.unitStates)
	})

	it('honors an explicit mode override', () => {
		const reg: UnitRegistry = {
			board: createTestBoard(3),
			unitStates: {}
		}
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 3, r_idx: 3 }

		const next = trainUnit(reg, unit, pos, { mode: 'acted' })

		expect(next.unitStates[unit.id]?.mode).toBe('acted')
	})
})

describe('unitsLow primitives', () => {
	it('recordKill increments kills and killsThisTurn', () => {
		const killer = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 2, r_idx: 3 }
		const reg = seedRegistry([{ unit: killer, pos }])

		const next = unitsLow.recordKill(reg, killer.id)

		expect(next.unitStates[killer.id]?.kills).toBe(1)
		expect(next.unitStates[killer.id]?.killsThisTurn).toBe(1)
	})

	it('addDebuff appends to the unit', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 2, r_idx: 3 }
		const reg = seedRegistry([{ unit, pos }])

		const next = unitsLow.addDebuff(reg, unit.id, {
			type: 'morale_loss',
			atkReduction: 1,
			turnsRemaining: 2
		})

		expect(next.unitStates[unit.id]?.debuffs).toHaveLength(1)
		expect(next.unitStates[unit.id]?.debuffs[0]?.type).toBe('morale_loss')
	})

	it('setMode updates the unit mode', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 2, r_idx: 3 }
		const reg = seedRegistry([{ unit, pos }])

		const next = unitsLow.setMode(reg, unit.id, 'acted')

		expect(next.unitStates[unit.id]?.mode).toBe('acted')
	})

	it('remove drops the unit from board and unitStates', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 2, r_idx: 3 }
		const reg = seedRegistry([{ unit, pos }])

		const next = unitsLow.remove(reg, unit.id)

		expect(next.board[pos.r_idx]?.[pos.q_idx]?.unit).toBeNull()
		expect(next.unitStates[unit.id]).toBeUndefined()
		assertBoardUnitStatesConsistency(next.board, next.unitStates)
	})
})

describe('UnitRegistry interface', () => {
	it('keeps board and unit state paired when updating one Unit', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 1, r_idx: 1 }
		const reg = seedRegistry([{ unit, pos }])

		const next = mapUnitStates(reg, (state, id) =>
			id === unit.id ? { ...state, health: state.health - 3 } : state
		)

		expect(tileAt(next, pos)?.unit).toEqual(unit)
		expect(next.unitStates[unit.id]?.health).toBe(
			requireTestValue(reg.unitStates[unit.id]).health - 3
		)
		expect(next.board).toBe(reg.board)
		expect(next.unitStates).not.toBe(reg.unitStates)
	})

	it('iterates occupied tiles as the public board/unit pairing query', () => {
		const unit = createTestUnit('barbarians', 'caveman')
		const pos = { q_idx: 1, r_idx: 1 }
		const reg = seedRegistry([{ unit, pos }])

		expect(occupiedTiles(reg, 'barbarians')).toEqual([
			{
				position: pos,
				tile: tileAt(reg, pos),
				unit,
				state: reg.unitStates[unit.id]
			}
		])
		expect(occupiedTiles(reg, 'rogues')).toEqual([])
	})
})
