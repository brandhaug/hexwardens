import {
	getEffectiveMaxHealth,
	getEffectiveUnitStatsForTerrain,
	unitPassiveToDescription,
	unitToUnitStats
} from './unit'
import { createTestUnitState } from '../test/game-test-helpers'

describe('Heroes have static stats — killsThisTurn does not drive hero progression', () => {
	const heroPosition = { q_idx: 0, r_idx: 0 }

	it('Berserker max HP is independent of kills', () => {
		const fresh = createTestUnitState(heroPosition, 'berserker')
		const veteran = createTestUnitState(heroPosition, 'berserker', {
			kills: 99,
			killsThisTurn: 5
		})
		expect(getEffectiveMaxHealth('berserker', fresh)).toBe(
			unitToUnitStats.berserker.health
		)
		expect(getEffectiveMaxHealth('berserker', veteran)).toBe(
			unitToUnitStats.berserker.health
		)
	})

	it('every Hero unit has fixed max HP regardless of kill count', () => {
		const heroes = [
			'berserker',
			'shogun',
			'wolf',
			'orc_raider',
			'black_knight',
			'clanker',
			'paladin',
			'skeleton_golem',
			'frostlord'
		] as const
		for (const hero of heroes) {
			const stoked = createTestUnitState(heroPosition, hero, {
				kills: 50,
				killsThisTurn: 5
			})
			expect(getEffectiveMaxHealth(hero, stoked)).toBe(
				unitToUnitStats[hero].health
			)
		}
	})
})

describe('getEffectiveUnitStatsForTerrain', () => {
	it('keeps land stats on land terrains', () => {
		expect(getEffectiveUnitStatsForTerrain('caveman', 'grass')).toEqual(
			unitToUnitStats.caveman
		)
	})

	it('shifts ground units into boat form on shallow water', () => {
		const onWater = getEffectiveUnitStatsForTerrain('caveman', 'water')
		expect(onWater.air).toBe(true)
		expect(onWater.attack).toBe(8)
		expect(onWater.range).toBe(2)
	})

	it('shifts ground units into boat form on deep ocean as well', () => {
		const onOcean = getEffectiveUnitStatsForTerrain('caveman', 'ocean')
		const onWater = getEffectiveUnitStatsForTerrain('caveman', 'water')
		expect(onOcean).toEqual(onWater)
	})

	it('upgrades bombardier to bombship form on ocean', () => {
		const onOcean = getEffectiveUnitStatsForTerrain('bombardier', 'ocean')
		expect(onOcean.attack).toBe(14)
		expect(onOcean.defense).toBe(14)
		expect(onOcean.passive).toBe('splash')
	})

	it('upgrades tidebreaker to battleship form on ocean', () => {
		const onOcean = getEffectiveUnitStatsForTerrain('tidebreaker', 'ocean')
		expect(onOcean.attack).toBe(16)
		expect(onOcean.defense).toBe(10)
		expect(onOcean.passive).toBe('tide_command')
	})
})

describe('unitPassiveToDescription', () => {
	it('exposes flying as a documented passive', () => {
		expect(unitPassiveToDescription.flying).toBeDefined()
		expect(unitPassiveToDescription.flying.name).toBe('Flying')
	})
})
