import { Result } from 'effect'
import { previewCombat, resolveCombat } from './resolve'
import { buildCombatScenario } from './testing'
import { unitAbilities } from './abilities/abilities'

describe('resolveCombat — engine boundary', () => {
	it('is deterministic for the same input (no implicit Math.random)', () => {
		const build = () =>
			buildCombatScenario({
				attacker: {
					tribe: 'barbarians',
					type: 'caveman',
					pos: { q_idx: 2, r_idx: 2 }
				},
				defender: {
					tribe: 'rogues',
					type: 'caveman',
					pos: { q_idx: 3, r_idx: 2 }
				}
			})
		const s1 = build()
		const s2 = build()
		const r1 = resolveCombat(s1.gameState, {
			from: s1.attackerPos,
			to: s1.defenderPos,
			grid: s1.grid
		})
		const r2 = resolveCombat(s2.gameState, {
			from: s2.attackerPos,
			to: s2.defenderPos,
			grid: s2.grid
		})
		assert(Result.isSuccess(r1) && Result.isSuccess(r2))
		expect(r1.success.events.map((e) => e.type)).toEqual(
			r2.success.events.map((e) => e.type)
		)
	})

	it('rejects attacking with a unit the current player does not control', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'druids',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			},
			// It is barbarians' turn — neither combatant belongs to them.
			gameStateOverrides: { currentPlayerTribe: 'barbarians' }
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})

	it('does not double-apply abilities (each fires at most once per qualifying combat)', () => {
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
		// Hex curse is the only debuff event expected.
		const debuffs = result.success.events.filter(
			(e) => e.type === 'debuff_applied'
		)
		expect(debuffs).toHaveLength(1)
	})

	it('engine returns a new GameState (immutability)', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		expect(result.success.state).not.toBe(scenario.gameState)
	})
})

describe('unitAbilities registry', () => {
	it('every entry binds to a known UnitType and has at least one hook', () => {
		expect(unitAbilities.length).toBeGreaterThan(0)
		for (const ability of unitAbilities) {
			expect(ability.unit).toEqual(expect.any(String))
			const hookCount = Object.keys(ability.hooks).length
			expect(hookCount).toBeGreaterThan(0)
		}
	})

	it('hook keys are limited to the documented phases', () => {
		const allowed = new Set([
			'preDamage',
			'onDamage',
			'beforeCounter',
			'postHit',
			'onDeath',
			'modeAfterAttack'
		])
		for (const ability of unitAbilities) {
			for (const key of Object.keys(ability.hooks)) {
				expect(allowed.has(key)).toBe(true)
			}
		}
	})
})

describe('counter ability phases', () => {
	it('does not heal an Orc Raider after a counter kill', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 },
				state: { health: 1 }
			},
			defender: {
				tribe: 'rogues',
				type: 'orc_raider',
				pos: { q_idx: 3, r_idx: 2 },
				state: { health: 30 }
			}
		})
		const result = Result.getOrThrow(
			resolveCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
		)
		const hit = result.events.find((event) => event.type === 'attack')
		assert(hit?.type === 'attack')
		expect(result.state.units.unitStates[scenario.attacker.id]).toBeUndefined()
		expect(result.state.units.unitStates[scenario.defender.id]?.health).toBe(
			30 - hit.damage
		)
		expect(result.state.units.unitStates[scenario.defender.id]?.kills).toBe(1)
	})

	it.each<'guard' | 'skeleton_golem'>(['guard', 'skeleton_golem'])(
		'applies counter curse only after a landed hit against %s',
		(type) => {
			const scenario = buildCombatScenario({
				attacker: { tribe: 'barbarians', type, pos: { q_idx: 2, r_idx: 2 } },
				defender: {
					tribe: 'rogues',
					type: 'black_knight',
					pos: { q_idx: 3, r_idx: 2 }
				}
			})
			const attack = {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			}
			const before = structuredClone(scenario.gameState)
			const preview = previewCombat(scenario.gameState, attack)
			const result = Result.getOrThrow(
				resolveCombat(scenario.gameState, attack)
			)
			const curses = result.state.units.unitStates[
				scenario.attacker.id
			]?.debuffs.filter((debuff) => debuff.type === 'hex_curse')
			expect(curses).toHaveLength(type === 'guard' ? 1 : 0)
			expect(
				result.events.filter((event) => event.type === 'debuff_applied')
			).toHaveLength(type === 'guard' ? 1 : 0)
			const counter = result.events.find((event) => event.type === 'counter')
			expect(preview.counter).toBe(
				counter?.type === 'counter' ? counter.damage : null
			)
			expect(scenario.gameState).toEqual(before)
		}
	)
})
