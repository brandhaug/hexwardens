import { Result } from 'effect'
import { resolveCombat } from '../resolve'
import { buildCombatScenario } from '../testing'

describe('Skeleton Golem — Mirage', () => {
	it('dodges the first attack received each turn', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'skeleton_golem',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		const dodge = result.success.events.find((e) => e.type === 'dodge')
		expect(dodge).toMatchObject({ context: 'attack' })
		// No damage event is recorded for a dodged attack.
		expect(result.success.events.some((e) => e.type === 'attack')).toBe(false)
		// Defender is left untouched health-wise.
		const defenderState =
			result.success.state.units.unitStates[scenario.defender.id]
		assert(defenderState)
		expect(defenderState.health).toBeGreaterThan(0)
		expect(defenderState.hasBeenAttackedThisTurn).toBe(true)
	})

	it('does not dodge once the unit has already been attacked this turn', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'skeleton_golem',
				pos: { q_idx: 3, r_idx: 2 },
				state: { hasBeenAttackedThisTurn: true }
			}
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		expect(
			result.success.events.find((e) => e.type === 'dodge')
		).toBeUndefined()
		expect(result.success.events.some((e) => e.type === 'attack')).toBe(true)
	})

	it('Mirage fires only once per qualifying combat (idempotent within one resolveCombat)', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'skeleton_golem',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		const dodgeEvents = result.success.events.filter((e) => e.type === 'dodge')
		expect(dodgeEvents).toHaveLength(1)
	})
})
