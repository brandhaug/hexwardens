import { Result } from 'effect'
import { calculateDamage } from './damage-formula'
import { getCounterAttack } from './counter-attack'
import { previewCombat, resolveCombat } from './resolve'
import { buildCombatScenario } from './testing'

describe('health-sensitive damage', () => {
	it.each([
		{ attackerHp: 20, defenderHp: 20, expected: 11 },
		{ attackerHp: 20, defenderHp: 10, expected: 15 },
		{ attackerHp: 10, defenderHp: 20, expected: 5 },
		// Float32 force division puts this just below the rounding midpoint.
		{ attackerHp: 10, defenderHp: 10, expected: 10 }
	])(
		'deals $expected at $attackerHp versus $defenderHp HP',
		({ attackerHp, defenderHp, expected }) => {
			expect(calculateDamage(10, 8, attackerHp, 20, defenderHp, 20)).toBe(
				expected
			)
		}
	)

	it('preserves both the configured offset and midpoint rounding', () => {
		expect(calculateDamage(10, 0, 20, 20, 20, 20)).toBe(19)
		expect(calculateDamage(0, 0, 20, 20, 20, 20)).toBe(0)
	})

	it('uses separate land and ship counter strengths', () => {
		expect(getCounterAttack('guard', 'grass')).toBe(16)
		expect(getCounterAttack('mage', 'grass')).toBe(4)
		expect(getCounterAttack('archer', 'water')).toBe(6)
		expect(getCounterAttack('bombardier', 'ocean')).toBe(10)
		expect(getCounterAttack('tidebreaker', 'water')).toBe(14)
	})

	it.each([
		'caveman',
		'guard',
		'black_knight',
		'skeleton_golem',
		'orc_raider'
	] as const)(
		'preview matches the committed attack against %s without mutating input',
		(type) => {
			const scenario = buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: 'caveman',
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: { tribe: 'rogues', type, pos: { q_idx: 3, r_idx: 2 } }
			})
			const before = structuredClone(scenario.gameState)
			const attack = {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			}
			const preview = previewCombat(scenario.gameState, attack)
			expect(scenario.gameState).toEqual(before)
			const result = Result.getOrThrow(
				resolveCombat(scenario.gameState, attack)
			)
			const hit = result.events.find((event) => event.type === 'attack')
			const counter = result.events.find((event) => event.type === 'counter')
			expect(preview.expected).toBe(hit?.type === 'attack' ? hit.damage : 0)
			expect(preview.counter).toBe(
				counter?.type === 'counter' ? counter.damage : null
			)
		}
	)
})
