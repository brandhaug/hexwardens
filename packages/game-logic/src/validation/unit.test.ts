import { describe, expect, it } from 'vite-plus/test'
import { type Unit, type UnitState, unitToUnitStats } from '../domains/unit'

import {
	canUnitAttack,
	canUnitCapture,
	canUnitExplore,
	canUnitHeal
} from './unit'

function mkUnit(type: 'caveman' | 'seer' = 'caveman'): Unit {
	return {
		id: 'unit_test',
		type,
		stats: unitToUnitStats[type],
		tribe: 'barbarians'
	}
}

function mkState(mode: UnitState['mode']): UnitState {
	return {
		mode,
		health: 10,
		level: 1,
		kills: 0,
		killsThisTurn: 0,
		position: { q_idx: 0, r_idx: 0 },
		debuffs: [],
		veterancyBonusAtk: 0,
		veterancyBonusHp: 0,
		hasBeenAttackedThisTurn: false
	}
}

describe('canUnitAttack', () => {
	const unit = mkUnit('caveman')

	it('rejects undefined state', () => {
		expect(canUnitAttack(undefined, unit)).toBe(false)
	})

	it('allows ready units', () => {
		expect(canUnitAttack(mkState('ready'), unit)).toBe(true)
	})

	it('rejects acted units', () => {
		expect(canUnitAttack(mkState('acted'), unit)).toBe(false)
	})

	it('rejects retreating units', () => {
		expect(canUnitAttack(mkState('retreat'), unit)).toBe(false)
	})

	it('allows moved units with canAttackAfterMove', () => {
		expect(canUnitAttack(mkState('moved'), unit)).toBe(
			unit.stats.canAttackAfterMove
		)
	})

	it('allows a moved flying unit to attack on the same turn (default true)', () => {
		// Flying defaults attack-after-move to true. The validator simply
		// reads the unit's stats — so when flying is paired with the default
		// canAttackAfterMove=true, the unit can attack on the turn it moved.
		const flyingSoldier: Unit = {
			...unit,
			stats: { ...unit.stats, passive: 'flying' }
		}
		expect(flyingSoldier.stats.canAttackAfterMove).toBe(true)
		expect(canUnitAttack(mkState('moved'), flyingSoldier)).toBe(true)
	})

	it('respects an explicit canAttackAfterMove=false override for flying units', () => {
		// Spec: "Unless the unit has an explicit attack-after-move stat that's
		// false, flying units can attack on the same turn they moved." Explicit
		// false still wins, so flying does not silently override per-unit choice.
		const flyingNoAttack: Unit = {
			...unit,
			stats: { ...unit.stats, passive: 'flying', canAttackAfterMove: false }
		}
		expect(canUnitAttack(mkState('moved'), flyingNoAttack)).toBe(false)
	})
})

describe('canUnitCapture', () => {
	it('rejects acted units', () => {
		expect(canUnitCapture(mkState('acted'), mkUnit())).toBe(false)
	})

	it('rejects retreating units', () => {
		expect(canUnitCapture(mkState('retreat'), mkUnit('seer'))).toBe(false)
	})

	it('rejects moved units when canCaptureAfterMove is false', () => {
		const unit = mkUnit('caveman')
		expect(unit.stats.canCaptureAfterMove).toBe(false)
		expect(canUnitCapture(mkState('moved'), unit)).toBe(false)
	})

	it('allows ready units', () => {
		expect(canUnitCapture(mkState('ready'), mkUnit())).toBe(true)
	})
})

describe('canUnitExplore / canUnitHeal', () => {
	it('require ready mode', () => {
		expect(canUnitExplore(mkState('ready'))).toBe(true)
		expect(canUnitExplore(mkState('moved'))).toBe(false)
		expect(canUnitExplore(mkState('retreat'))).toBe(false)
		expect(canUnitExplore(mkState('acted'))).toBe(false)
		expect(canUnitHeal(mkState('ready'))).toBe(true)
		expect(canUnitHeal(mkState('retreat'))).toBe(false)
		expect(canUnitHeal(mkState('acted'))).toBe(false)
	})
})
