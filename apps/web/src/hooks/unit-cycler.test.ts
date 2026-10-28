import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type UnitId } from '@hexwardens/game-logic/domains/unit'
import { type ActionableUnit } from '@hexwardens/game-logic/player/actionable-units'
import { cycleStep } from './unit-cycler'

function makeUnit(id: UnitId, q: number, r: number): ActionableUnit {
	const position: BoardPosition = { q_idx: q, r_idx: r }
	return {
		unit: {
			id,
			type: 'caveman',
			tribe: 'barbarians',
			// stats unused for cycling logic — tests only depend on id/position
			stats: {
				health: 20,
				attack: 10,
				defense: 8,
				canAttackAfterMove: true,
				canCaptureAfterMove: false,
				movement: 1,
				range: 1,
				cost: 2,
				air: false,
				waterMovement: 1,
				waterRange: 1,
				explorationRange: 1,
				specialAttackAttribute: null,
				requiredTech: null,
				passive: null
			}
		},
		state: {
			mode: 'ready',
			health: 20,
			level: 1,
			kills: 0,
			killsThisTurn: 0,
			position,
			debuffs: [],
			veterancyBonusAtk: 0,
			veterancyBonusHp: 0,
			hasBeenAttackedThisTurn: false
		},
		position
	}
}

const a = makeUnit('unit_1', 0, 0)
const b = makeUnit('unit_2', 1, 0)
const c = makeUnit('unit_3', 2, 0)

describe('cycleStep', () => {
	it('returns null when there are no actionable units', () => {
		expect(
			cycleStep({
				actionable: [],
				currentUnitId: null,
				passed: new Set(),
				direction: 'next'
			})
		).toBeNull()
	})

	it('selects the first actionable unit when none is currently selected', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: null,
				passed: new Set(),
				direction: 'next'
			})
		).toEqual(a)
	})

	it('advances to the next actionable unit after the current one', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: a.unit.id,
				passed: new Set(),
				direction: 'next'
			})
		).toEqual(b)
	})

	it('wraps around to the first unit after the last one', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: c.unit.id,
				passed: new Set(),
				direction: 'next'
			})
		).toEqual(a)
	})

	it('skips passed units when advancing', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: a.unit.id,
				passed: new Set([b.unit.id]),
				direction: 'next'
			})
		).toEqual(c)
	})

	it('returns null when every actionable unit is passed', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: null,
				passed: new Set([a.unit.id, b.unit.id, c.unit.id]),
				direction: 'next'
			})
		).toBeNull()
	})

	it('moves backward one slot for direction=previous', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: c.unit.id,
				passed: new Set(),
				direction: 'previous'
			})
		).toEqual(b)
	})

	it('wraps to the last unit when going previous from the first', () => {
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: a.unit.id,
				passed: new Set(),
				direction: 'previous'
			})
		).toEqual(c)
	})

	it('starts from the first unit when current is no longer in the list', () => {
		const stale: UnitId = 'unit_99'
		expect(
			cycleStep({
				actionable: [a, b, c],
				currentUnitId: stale,
				passed: new Set(),
				direction: 'next'
			})
		).toEqual(a)
	})
})
