import { requireTestValue } from '../../test/game-test-helpers'
import { Result } from 'effect'
import { resolveCombat } from '../resolve'
import { buildCombatScenario } from '../testing'

describe('Hero death — morale cascade', () => {
	it("debuffs surviving allies of the dead hero's tribe with morale_loss", () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'archer',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'shogun',
				pos: { q_idx: 4, r_idx: 2 },
				state: { health: 1 }
			},
			extras: [
				{
					tribe: 'rogues',
					type: 'caveman',
					pos: { q_idx: 4, r_idx: 3 }
				},
				{
					tribe: 'rogues',
					type: 'archer',
					pos: { q_idx: 3, r_idx: 3 }
				}
			]
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		const ally1State =
			result.success.state.units.unitStates[
				requireTestValue(scenario.extras[0]).id
			]
		const ally2State =
			result.success.state.units.unitStates[
				requireTestValue(scenario.extras[1]).id
			]
		assert(ally1State && ally2State)
		expect(ally1State.debuffs.some((d) => d.type === 'morale_loss')).toBe(true)
		expect(ally2State.debuffs.some((d) => d.type === 'morale_loss')).toBe(true)
	})

	it('does not debuff allies when a non-hero unit dies', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'archer',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 4, r_idx: 2 },
				state: { health: 1 }
			},
			extras: [
				{
					tribe: 'rogues',
					type: 'archer',
					pos: { q_idx: 3, r_idx: 3 }
				}
			]
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		const allyState =
			result.success.state.units.unitStates[
				requireTestValue(scenario.extras[0]).id
			]
		assert(allyState)
		expect(allyState.debuffs.some((d) => d.type === 'morale_loss')).toBe(false)
	})
})
