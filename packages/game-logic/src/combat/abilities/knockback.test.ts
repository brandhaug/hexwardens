import { requireTestValue } from '../../test/game-test-helpers'
import { Result } from 'effect'
import {
	unitPassiveToDescription,
	unitToUnitStats,
	type UnitPassive,
	type UnitType
} from '../../domains/unit'
import { resolveCombat } from '../resolve'
import { buildCombatScenario } from '../testing'

/**
 * Knockback combat passive (#136). When an attacker with the `knockback`
 * passive lands a non-lethal hit, the defender is pushed one tile in the
 * direction `attacker → target`. If the destination is blocked, the defender
 * takes +5 damage and stays put. If the destination is water/ocean and the
 * defender is non-naval, the defender drowns. A pushed unit (moved or drowned)
 * does not counter-attack; a defender that took blocked damage does counter.
 */

/**
 * No production unit currently carries `knockback`. Tests opt-in by
 * temporarily granting the passive to a chosen unit type, and restoring on
 * teardown so the global stats table stays clean for other suites.
 */
const KNOCKBACK_HOST: UnitType = 'caveman'

function withKnockback<T>(host: UnitType, fn: () => T): T {
	const original = unitToUnitStats[host].passive
	unitToUnitStats[host] = { ...unitToUnitStats[host], passive: 'knockback' }
	try {
		return fn()
	} finally {
		unitToUnitStats[host] = { ...unitToUnitStats[host], passive: original }
	}
}

describe('Knockback — passive surface', () => {
	it("'knockback' is a valid UnitPassive with a description", () => {
		const passive: UnitPassive = 'knockback'
		expect(unitPassiveToDescription[passive].name).toBeTypeOf('string')
		expect(unitPassiveToDescription[passive].description).toBeTypeOf('string')
	})
})

describe('Knockback — combat resolution', () => {
	it('pushes a survivor one tile away from the attacker and skips the counter', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					tribe: 'rogues',
					type: 'guard',
					pos: { q_idx: 3, r_idx: 2 }
				}
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			const defenderState =
				result.success.state.units.unitStates[scenario.defender.id]
			assert(defenderState)
			// Pushed one tile east (away from attacker).
			expect(defenderState.position).toEqual({ q_idx: 4, r_idx: 2 })

			const board = result.success.state.units.board
			expect(board[2]?.[3]?.unit).toBeNull()
			expect(board[2]?.[4]?.unit?.id).toBe(scenario.defender.id)

			// Defender was pushed → no counter event.
			const counter = result.success.events.find((e) => e.type === 'counter')
			expect(counter).toBeUndefined()

			// Knockback emits a structured event so the UI/host can replay the move.
			const push = result.success.events.find((e) => e.type === 'knockback')
			expect(push).toBeDefined()
			assert(push?.type === 'knockback')
			expect(push.outcome).toBe('pushed')
			expect(push.from).toEqual({ q_idx: 3, r_idx: 2 })
			expect(push.to).toEqual({ q_idx: 4, r_idx: 2 })
		})
	})

	it('skips the push and the counter when the initial hit kills the target', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					tribe: 'rogues',
					type: 'caveman',
					pos: { q_idx: 3, r_idx: 2 },
					state: { health: 1 }
				}
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			expect(
				result.success.state.units.unitStates[scenario.defender.id]
			).toBeUndefined()
			expect(
				result.success.events.find((e) => e.type === 'knockback')
			).toBeUndefined()
			expect(
				result.success.events.find((e) => e.type === 'counter')
			).toBeUndefined()
		})
	})

	it('deals +5 blocked damage and lets the target counter when the destination is occupied', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					tribe: 'rogues',
					type: 'guard',
					pos: { q_idx: 3, r_idx: 2 }
				},
				extras: [
					{
						tribe: 'rogues',
						type: 'guard',
						pos: { q_idx: 4, r_idx: 2 }
					}
				]
			})
			const initialDefenderHealth = unitToUnitStats.guard.health
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			const defenderState =
				result.success.state.units.unitStates[scenario.defender.id]
			assert(defenderState)
			// Stayed put.
			expect(defenderState.position).toEqual({ q_idx: 3, r_idx: 2 })
			// Took regular hit damage AND +5 blocked damage.
			expect(defenderState.health).toBeLessThan(initialDefenderHealth - 5)

			const knockback = result.success.events.find(
				(e) => e.type === 'knockback'
			)
			assert(knockback?.type === 'knockback')
			expect(knockback.outcome).toBe('blocked')

			// Blocked-damage path: defender survived in place → counter fires.
			expect(
				result.success.events.find((e) => e.type === 'counter')
			).toBeDefined()
		})
	})

	it('deals +5 blocked damage when the push destination is off-board', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const radius = 2
			const lastCol = 2 * radius // edge of the board
			const scenario = buildCombatScenario({
				radius,
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: lastCol - 1, r_idx: radius }
				},
				defender: {
					tribe: 'rogues',
					type: 'guard',
					pos: { q_idx: lastCol, r_idx: radius }
				}
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			const defenderState =
				result.success.state.units.unitStates[scenario.defender.id]
			assert(defenderState)
			expect(defenderState.position).toEqual({
				q_idx: lastCol,
				r_idx: radius
			})

			const knockback = result.success.events.find(
				(e) => e.type === 'knockback'
			)
			assert(knockback?.type === 'knockback')
			expect(knockback.outcome).toBe('blocked')
		})
	})

	it('drowns a non-naval target pushed onto shallow water', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					tribe: 'rogues',
					type: 'guard',
					pos: { q_idx: 3, r_idx: 2 }
				},
				terrain: { '4,2': 'water' }
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			expect(
				result.success.state.units.unitStates[scenario.defender.id]
			).toBeUndefined()
			const knockback = result.success.events.find(
				(e) => e.type === 'knockback'
			)
			assert(knockback?.type === 'knockback')
			expect(knockback.outcome).toBe('drowned')
			expect(
				result.success.events.find((e) => e.type === 'counter')
			).toBeUndefined()
			expect(
				result.success.events.find(
					(e) => e.type === 'kill' && e.victimId === scenario.defender.id
				)
			).toBeDefined()
		})
	})

	it('drowns a non-naval target pushed onto ocean', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					tribe: 'rogues',
					type: 'guard',
					pos: { q_idx: 3, r_idx: 2 }
				},
				terrain: { '4,2': 'ocean' }
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			expect(
				result.success.state.units.unitStates[scenario.defender.id]
			).toBeUndefined()
			const knockback = result.success.events.find(
				(e) => e.type === 'knockback'
			)
			assert(knockback?.type === 'knockback')
			expect(knockback.outcome).toBe('drowned')
		})
	})

	it('does not drown a naval target pushed onto shallow water', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					// Tidebreaker is a naval unit (waterMovement = 3).
					tribe: 'rogues',
					type: 'tidebreaker',
					pos: { q_idx: 3, r_idx: 2 }
				},
				terrain: { '4,2': 'water' }
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			const defenderState =
				result.success.state.units.unitStates[scenario.defender.id]
			assert(defenderState)
			// Moved to the water tile.
			expect(defenderState.position).toEqual({ q_idx: 4, r_idx: 2 })

			const knockback = result.success.events.find(
				(e) => e.type === 'knockback'
			)
			assert(knockback?.type === 'knockback')
			expect(knockback.outcome).toBe('pushed')
			expect(
				result.success.events.find((e) => e.type === 'counter')
			).toBeUndefined()
		})
	})

	it('triggers the hero-morale cascade when the drown kills a hero', () => {
		withKnockback(KNOCKBACK_HOST, () => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: KNOCKBACK_HOST,
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					// Berserker is the barbarians' hero — pick a rogues-tribe hero
					// instead so the attacker is the cross-tribe killer.
					tribe: 'rogues',
					type: 'shogun',
					pos: { q_idx: 3, r_idx: 2 }
				},
				extras: [
					{
						tribe: 'rogues',
						type: 'caveman',
						pos: { q_idx: 0, r_idx: 0 }
					}
				],
				terrain: { '4,2': 'water' }
			})
			const result = resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
			assert(Result.isSuccess(result))

			// Hero is gone (drowned).
			expect(
				result.success.state.units.unitStates[scenario.defender.id]
			).toBeUndefined()

			// Surviving rogues unit gained the morale_loss debuff from the
			// hero-death cascade.
			const survivor = requireTestValue(scenario.extras[0])
			const survivorState = result.success.state.units.unitStates[survivor.id]
			assert(survivorState)
			expect(
				survivorState.debuffs.find((d) => d.type === 'morale_loss')
			).toBeDefined()
		})
	})

	it('leaves combat unchanged when the attacker has no knockback passive', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'guard',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))

		expect(
			result.success.events.find((e) => e.type === 'knockback')
		).toBeUndefined()
		// Defender stays put and a regular counter fires.
		const defenderState =
			result.success.state.units.unitStates[scenario.defender.id]
		assert(defenderState)
		expect(defenderState.position).toEqual({ q_idx: 3, r_idx: 2 })
		expect(
			result.success.events.find((e) => e.type === 'counter')
		).toBeDefined()
	})
})
