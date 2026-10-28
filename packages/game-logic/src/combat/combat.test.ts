import { requireTestValue, createTestVillage } from '../test/game-test-helpers'
import { Result } from 'effect'
import { GameHex } from '../board/hex-utils'
import { type Tech } from '../domains/tech'
import { unitToUnitStats } from '../domains/unit'
import { canAttack } from './range'
import { previewCombat, resolveCombat } from './resolve'
import { buildCombatScenario } from './testing'

describe('resolveCombat — basic outcomes', () => {
	it('kills a low-HP defender and walks the melee attacker onto the tile', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
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
			requireTestValue(result.success.state.units.board[2])[3]?.unit?.id
		).toBe(scenario.attacker.id)
		expect(
			requireTestValue(result.success.state.units.board[2])[2]?.unit
		).toBeNull()
		expect(result.success.events.some((e) => e.type === 'kill')).toBe(true)
	})

	it('ranged attacker stays in place when it kills the defender', () => {
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
			}
		})

		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		expect(result.success.message).toContain('from range')
		expect(
			requireTestValue(result.success.state.units.board[2])[2]?.unit?.id
		).toBe(scenario.attacker.id)
	})

	it('counter-attack fires when defender survives the initial hit', () => {
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
		const types = result.success.events.map((e) => e.type)
		expect(types).toContain('attack')
		expect(types).toContain('counter')
	})

	it('puts a surviving seer into retreat mode after attacking', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'seer',
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
		expect(
			result.success.state.units.unitStates[scenario.attacker.id]?.mode
		).toBe('retreat')
	})

	it('does not allow a retreating unit to attack again', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'seer',
				pos: { q_idx: 2, r_idx: 2 },
				state: { mode: 'retreat' }
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
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('UnitNotReadyError')
	})

	it('ranged attacker takes no counter damage when out of counter range', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'archer',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 4, r_idx: 2 }
			}
		})

		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isSuccess(result))
		expect(result.success.events.some((e) => e.type === 'counter')).toBe(false)
	})
})

describe('resolveCombat — validation', () => {
	it('rejects when attacker has already acted', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 },
				state: { mode: 'acted' }
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
		assert(Result.isFailure(result))
		expect(result.failure.message).toBe('Unit has already acted this turn')
	})

	it('rejects when a melee unit without canAttackAfterMove has moved', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'guard',
				pos: { q_idx: 2, r_idx: 2 },
				state: { mode: 'moved' }
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
		assert(Result.isFailure(result))
		expect(result.failure.message).toBe('Unit cannot attack after moving')
	})

	it('rejects when there are no units at the given positions', () => {
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
			from: { q_idx: 0, r_idx: 0 },
			to: { q_idx: 1, r_idx: 0 },
			grid: scenario.grid
		})
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})

	it('rejects when the target is out of attack range', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 1, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 4, r_idx: 2 }
			}
		})
		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('OutOfRangeError')
	})
})

describe('resolveCombat — named scenarios', () => {
	it('Splash damages enemy units adjacent to the target', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'mage',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 4, r_idx: 2 }
			},
			extras: [
				{
					tribe: 'rogues',
					type: 'caveman',
					pos: { q_idx: 4, r_idx: 1 }
				},
				{
					tribe: 'barbarians',
					type: 'caveman',
					pos: { q_idx: 3, r_idx: 2 }
				}
			]
		})

		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})

		assert(Result.isSuccess(result))
		const splashTarget = requireTestValue(scenario.extras[0])
		const friendly = requireTestValue(scenario.extras[1])
		expect(
			result.success.state.units.unitStates[splashTarget.id]?.health
		).toBeLessThan(unitToUnitStats.caveman.health)
		expect(result.success.state.units.unitStates[friendly.id]?.health).toBe(
			unitToUnitStats.caveman.health
		)
	})

	it('Spearman pierce damages the enemy directly behind the target', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'spearman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			},
			extras: [
				{
					tribe: 'rogues',
					type: 'caveman',
					pos: { q_idx: 4, r_idx: 2 }
				}
			]
		})

		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})

		assert(Result.isSuccess(result))
		const pierced = requireTestValue(scenario.extras[0])
		expect(
			result.success.state.units.unitStates[pierced.id]?.health
		).toBeLessThan(unitToUnitStats.caveman.health)
	})

	it('Sprinter rampage leaves the killer able to attack again but not move again', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'sprinter',
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
			result.success.state.units.unitStates[scenario.attacker.id]?.mode
		).toBe('moved')
	})

	it('Stone terrain no longer grants a defensive damage reduction (replaced by +1 sight)', () => {
		const onGrass = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'sprinter',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const onStone = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'sprinter',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			},
			terrain: {
				'3,2': 'stone'
			}
		})
		const stoneState = {
			...onStone.gameState,
			playerStates: {
				...onStone.gameState.playerStates,
				rogues: {
					...requireTestValue(onStone.gameState.playerStates.rogues),
					researchedTechs: ['climbing'] satisfies Tech[]
				}
			}
		}
		const grass = previewCombat(onGrass.gameState, {
			from: onGrass.attackerPos,
			to: onGrass.defenderPos,
			grid: onGrass.grid
		})
		const stone = previewCombat(stoneState, {
			from: onStone.attackerPos,
			to: onStone.defenderPos,
			grid: onStone.grid
		})
		expect(stone.expected).toBe(grass.expected)
	})

	it('Sprinter no longer gains a Charge damage bonus after moving (replaced by Rampage)', () => {
		const baseline = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'sprinter',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const moved = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'sprinter',
				pos: { q_idx: 2, r_idx: 2 },
				state: { mode: 'moved' }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const base = previewCombat(baseline.gameState, {
			from: baseline.attackerPos,
			to: baseline.defenderPos,
			grid: baseline.grid
		})
		const afterMove = previewCombat(moved.gameState, {
			from: moved.attackerPos,
			to: moved.defenderPos,
			grid: moved.grid
		})
		expect(afterMove.expected).toBe(base.expected)
	})

	it('Spearman "Brace" increases damage when counter-attacking cavalry', () => {
		const vsInfantry = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'spearman',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const vsCavalry = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'seer',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'spearman',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const infantry = previewCombat(vsInfantry.gameState, {
			from: vsInfantry.attackerPos,
			to: vsInfantry.defenderPos,
			grid: vsInfantry.grid
		})
		const cavalry = previewCombat(vsCavalry.gameState, {
			from: vsCavalry.attackerPos,
			to: vsCavalry.defenderPos,
			grid: vsCavalry.grid
		})
		// Spearman's counter against cavalry is amplified by Brace.
		assert(infantry.counter !== null && cavalry.counter !== null)
		expect(cavalry.counter).toBeGreaterThan(infantry.counter)
	})

	it('Shogun "Bushido" aura raises adjacent ally damage', () => {
		const withoutAura = buildCombatScenario({
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
		const withAura = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 }
			},
			extras: [
				{
					tribe: 'barbarians',
					type: 'shogun',
					pos: { q_idx: 2, r_idx: 3 }
				}
			]
		})
		const base = previewCombat(withoutAura.gameState, {
			from: withoutAura.attackerPos,
			to: withoutAura.defenderPos,
			grid: withoutAura.grid
		})
		const aura = previewCombat(withAura.gameState, {
			from: withAura.attackerPos,
			to: withAura.defenderPos,
			grid: withAura.grid
		})
		expect(aura.expected).toBeGreaterThan(base.expected)
	})

	it('Paladin pierces through a lined-up defender', () => {
		const scenario = buildCombatScenario({
			radius: 3,
			attacker: {
				tribe: 'barbarians',
				type: 'paladin',
				pos: { q_idx: 3, r_idx: 3 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 4, r_idx: 3 }
			},
			extras: [
				{
					tribe: 'rogues',
					type: 'caveman',
					pos: { q_idx: 5, r_idx: 3 }
				}
			]
		})

		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})

		assert(Result.isSuccess(result))
		const pierced = requireTestValue(scenario.extras[0])
		expect(result.success.state.units.unitStates[pierced.id]).toBeUndefined()
		expect(
			result.success.events.some(
				(e) => e.type === 'attack' && e.defenderId === pierced.id
			)
		).toBe(true)
	})

	it('land units on water fight with boat range', () => {
		const scenario = buildCombatScenario({
			radius: 3,
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 3 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 4, r_idx: 3 }
			},
			terrain: {
				'2,3': 'water'
			}
		})

		const result = resolveCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})

		assert(Result.isSuccess(result))
		expect(
			result.success.events.some(
				(e) => e.type === 'attack' && e.defenderId === scenario.defender.id
			)
		).toBe(true)
	})

	it('Bombardier becomes tougher as a bombship on water', () => {
		const land = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'bombardier',
				pos: { q_idx: 3, r_idx: 2 }
			}
		})
		const water = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'bombardier',
				pos: { q_idx: 3, r_idx: 2 }
			},
			terrain: {
				'3,2': 'water'
			}
		})

		const landHit = previewCombat(land.gameState, {
			from: land.attackerPos,
			to: land.defenderPos,
			grid: land.grid
		})
		const waterHit = previewCombat(water.gameState, {
			from: water.attackerPos,
			to: water.defenderPos,
			grid: water.grid
		})

		expect(waterHit.expected).toBeLessThan(landHit.expected)
	})
})

describe('previewCombat', () => {
	it('returns zero expected and null counter when the attack would be dodged', () => {
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
		expect(
			previewCombat(scenario.gameState, {
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			})
		).toEqual({ expected: 0, counter: null })
	})

	it('returns expected damage and null counter when the attack kills the defender', () => {
		const scenario = buildCombatScenario({
			attacker: {
				tribe: 'barbarians',
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 }
			},
			defender: {
				tribe: 'rogues',
				type: 'caveman',
				pos: { q_idx: 3, r_idx: 2 },
				state: { health: 1 }
			}
		})
		const preview = previewCombat(scenario.gameState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})
		expect(preview.counter).toBeNull()
		expect(preview.expected).toBeGreaterThan(0)
	})

	it('City Wall reduces damage against units defending owned villages', () => {
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
		const board = scenario.gameState.units.board.map((row, r_idx) =>
			row.map((tile, q_idx) => {
				if (r_idx !== 2 || q_idx !== 3 || !tile) {
					return tile
				}
				return { ...tile, item: createTestVillage('rogues') }
			})
		)
		const researchedTechs: Tech[] = ['city_wall']
		const fortifiedState = {
			...scenario.gameState,
			units: {
				...scenario.gameState.units,
				board
			},
			playerStates: {
				...scenario.gameState.playerStates,
				rogues: {
					...requireTestValue(scenario.gameState.playerStates.rogues),
					researchedTechs
				}
			}
		}

		const baseline = previewCombat(
			{ ...scenario.gameState, units: { ...scenario.gameState.units, board } },
			{
				from: scenario.attackerPos,
				to: scenario.defenderPos,
				grid: scenario.grid
			}
		)
		const fortified = previewCombat(fortifiedState, {
			from: scenario.attackerPos,
			to: scenario.defenderPos,
			grid: scenario.grid
		})

		expect(fortified.expected).toBeLessThan(baseline.expected)
	})
})

describe('canAttack', () => {
	it('allows an enemy within range and blocks an ally or out-of-range target', () => {
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

		expect(
			canAttack(
				scenario.attacker,
				scenario.attackerPos,
				scenario.defender,
				scenario.defenderPos,
				GameHex,
				scenario.grid.radius,
				[]
			)
		).toBe(true)

		expect(
			canAttack(
				scenario.attacker,
				scenario.attackerPos,
				scenario.attacker,
				scenario.attackerPos,
				GameHex,
				scenario.grid.radius,
				[]
			)
		).toBe(false)

		expect(
			canAttack(
				scenario.attacker,
				scenario.attackerPos,
				scenario.defender,
				{ q_idx: 4, r_idx: 2 },
				GameHex,
				scenario.grid.radius,
				[]
			)
		).toBe(false)
	})
})
