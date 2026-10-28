import { Result } from 'effect'
import { resolveCombat } from '../resolve'
import { buildCombatScenario } from '../testing'

describe('Black Knight — Hex Curse', () => {
	it('applies a 2-turn atkReduction debuff to a surviving target', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'black_knight',
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
		const debuff = result.success.events.find(
			(e) => e.type === 'debuff_applied'
		)
		expect(debuff).toBeDefined()
		assert(debuff?.type === 'debuff_applied')
		expect(debuff.debuff.type).toBe('hex_curse')
		expect(debuff.debuff.atkReduction).toBe(3)
		expect(debuff.debuff.turnsRemaining).toBe(2)
	})

	it('does not apply when the target dies from the hit', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'black_knight',
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
		const debuff = result.success.events.find(
			(e) => e.type === 'debuff_applied'
		)
		expect(debuff).toBeUndefined()
	})

	it('fires exactly once per attack — no double application', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'black_knight',
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
		const debuffEvents = result.success.events.filter(
			(e) => e.type === 'debuff_applied'
		)
		expect(debuffEvents).toHaveLength(1)
		const defenderState =
			result.success.state.units.unitStates[scenario.defender.id]
		assert(defenderState)
		expect(
			defenderState.debuffs.filter((d) => d.type === 'hex_curse')
		).toHaveLength(1)
	})
})
