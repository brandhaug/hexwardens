import { Result } from 'effect'
import { resolveCombat } from '../resolve'
import { buildCombatScenario } from '../testing'

describe('Orc Raider — Bloodlust', () => {
	it('heals 5 HP on a forward kill, capped at max HP', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'orcs',
				type: 'orc_raider',
				pos: { q_idx: 2, r_idx: 2 },
				state: { health: 5 }
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
		const orc_raiderState =
			result.success.state.units.unitStates[scenario.attacker.id]
		assert(orc_raiderState)
		expect(orc_raiderState.health).toBe(10)
	})

	it('does not over-heal past effective max HP', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'orcs',
				type: 'orc_raider',
				pos: { q_idx: 2, r_idx: 2 }
				// default full health
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 },
				state: { health: 1 }
			}
		})
		const before =
			scenario.gameState.units.unitStates[scenario.attacker.id]?.health ?? 0
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		const orc_raiderState =
			result.success.state.units.unitStates[scenario.attacker.id]
		assert(orc_raiderState)
		// Health stays at the original max (no overheal).
		expect(orc_raiderState.health).toBe(before)
	})
})
