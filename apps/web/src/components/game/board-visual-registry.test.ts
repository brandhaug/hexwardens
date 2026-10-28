import {
	primaryBuildings,
	type PrimaryBuildingState
} from '@hexwardens/game-logic/domains/primary-building'
import { resources } from '@hexwardens/game-logic/domains/resource'
import { secondaryBuildings } from '@hexwardens/game-logic/domains/secondary-building'
import {
	unitToUnitStats,
	type Unit,
	type UnitType
} from '@hexwardens/game-logic/domains/unit'
import { utilityBuildings } from '@hexwardens/game-logic/domains/utility-building'
import {
	createVillage,
	type Village
} from '@hexwardens/game-logic/domains/village'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	describeTileItemVisual,
	getVisualEntry,
	tribeToMaterialColor
} from './board-visual-registry'
import { heroVisualRegistry } from './hero-visual-registry'
import { unitVisualRegistry, waterUnitVisual } from './unit-visual-registry'
import { villageVisualRegistry } from './village-visual-registry'
import {
	primaryBuildingVisualRegistry,
	secondaryBuildingVisualRegistry
} from './building-visual-registry'
import { resourceVisualRegistry } from './resource-visual-registry'
import { ruinsVisualRegistry } from './ruins-visual-registry'

describe('board visual registry', () => {
	it('labels every tile item family', () => {
		const primaryStates: readonly PrimaryBuildingState[] = ['idle', 'built']

		for (const value of primaryBuildings) {
			for (const state of primaryStates) {
				expect(
					describeTileItemVisual({
						type: 'primaryBuilding',
						value,
						state,
						tribe: 'barbarians'
					})
				).not.toBe('')
			}
		}

		for (const value of secondaryBuildings) {
			expect(
				describeTileItemVisual({
					type: 'secondaryBuilding',
					value,
					state: 'built',
					tribe: 'barbarians'
				})
			).not.toBe('')
		}

		for (const value of utilityBuildings) {
			expect(
				describeTileItemVisual({
					type: 'utilityBuilding',
					value,
					state: 'built',
					tribe: 'barbarians'
				})
			).not.toBe('')
		}

		for (const value of resources) {
			expect(describeTileItemVisual({ type: 'resource', value })).not.toBe('')
		}

		expect(describeTileItemVisual(createVillage(1))).not.toBe('')
		expect(describeTileItemVisual({ type: 'ruins', reward: 'money' })).not.toBe(
			''
		)
	})
})

function makeUnit(type: UnitType, tribe: Tribe = 'barbarians'): Unit {
	return { id: 'unit_test', type, stats: unitToUnitStats[type], tribe }
}

function makeVillage(level: Village['level'], tribe: Tribe | null): Village {
	return { ...createVillage(1), level, tribe }
}

describe('getVisualEntry dispatcher', () => {
	it('routes a level-1 village to the small village tier', () => {
		const visual = getVisualEntry(createVillage(1))
		expect(visual.type).toBe('village')
		expect(visual.entry).toBe(villageVisualRegistry['village-small'])
		// villageLevelScale: 1.04 + (level - 1) * 0.04
		expect(visual.groupScale).toBeCloseTo(1.04)
		expect(visual.meshScale).toBeUndefined()
	})

	it('routes an owned level-5 village to the capital entry with the level-driven group scale', () => {
		const visual = getVisualEntry(makeVillage(5, 'barbarians'))
		expect(visual.entry).toBe(villageVisualRegistry.capital)
		expect(visual.groupScale).toBeCloseTo(1.2)
	})

	it('routes an unowned high-level village to the large village tier', () => {
		const visual = getVisualEntry(makeVillage(13, null))
		expect(visual.entry).toBe(villageVisualRegistry['village-large'])
		expect(visual.groupScale).toBeCloseTo(1.52)
	})

	it('routes a primary building to its registry entry with no extra scaling', () => {
		const visual = getVisualEntry({
			type: 'primaryBuilding',
			value: 'tavern',
			state: 'built',
			tribe: 'barbarians'
		})
		expect(visual.type).toBe('building')
		expect(visual.entry).toBe(primaryBuildingVisualRegistry.tavern)
		expect(visual.groupScale).toBe(1)
		expect(visual.meshScale).toBeUndefined()
	})

	it('applies the building mesh multiplier to a large secondary building registry scale', () => {
		const visual = getVisualEntry({
			type: 'secondaryBuilding',
			value: 'dock',
			state: 'large',
			tribe: 'barbarians'
		})
		expect(visual.entry).toBe(secondaryBuildingVisualRegistry.dock.large)
		// registry scale 1.25 * BUILDING_MESH_MULTIPLIER 1.22
		expect(visual.meshScale).toBeCloseTo(1.525)
	})

	it('routes a resource to its registry entry with the shared resource group scale', () => {
		const visual = getVisualEntry({ type: 'resource', value: 'apple' })
		expect(visual.type).toBe('resource')
		expect(visual.entry).toBe(resourceVisualRegistry.apple)
		expect(visual.groupScale).toBe(1)
		expect(visual.meshScale).toBeUndefined()
	})

	it('routes ruins to the ruins registry entry at native scale', () => {
		const visual = getVisualEntry({ type: 'ruins', reward: 'money' })
		expect(visual.type).toBe('ruins')
		expect(visual.entry).toBe(ruinsVisualRegistry.ruins)
		expect(visual.groupScale).toBe(1)
		expect(visual.meshScale).toBeUndefined()
	})

	it('falls back to the ship visual for a general unit on water, untinted', () => {
		const visual = getVisualEntry({
			type: 'unit',
			unit: makeUnit('archer'),
			terrain: 'water'
		})
		expect(visual.variant).toBe('water')
		expect(visual.entry).toBe(waterUnitVisual)
		expect(visual.groupScale).toBe(1)
		expect(visual.tintColor).toBeUndefined()
	})

	it('falls back to the ship visual for a hero on ocean — heroes are not exempt', () => {
		const visual = getVisualEntry({
			type: 'unit',
			unit: makeUnit('berserker'),
			terrain: 'ocean'
		})
		expect(visual.variant).toBe('water')
		expect(visual.entry).toBe(waterUnitVisual)
	})

	it('routes a hero unit on land to the hero registry with the hero scale boost', () => {
		const visual = getVisualEntry({
			type: 'unit',
			unit: makeUnit('berserker'),
			terrain: 'grass'
		})
		expect(visual.variant).toBe('hero')
		expect(visual.entry).toBe(heroVisualRegistry.berserker)
		expect(visual.groupScale).toBe(1.35)
		expect(visual.tintColor).toBeUndefined()
	})

	it('routes a general unit on land to the unit registry, tinted with its tribe color', () => {
		const visual = getVisualEntry({
			type: 'unit',
			unit: makeUnit('archer', 'rogues'),
			terrain: 'grass'
		})
		expect(visual.variant).toBe('general')
		expect(visual.entry).toBe(unitVisualRegistry.archer)
		expect(visual.groupScale).toBe(1)
		expect(visual.tintColor).toBe(tribeToMaterialColor.rogues)
	})

	it('routes a standalone hero query to the hero registry with the hero scale boost', () => {
		const visual = getVisualEntry({ type: 'hero', heroType: 'frostlord' })
		expect(visual.entry).toBe(heroVisualRegistry.frostlord)
		expect(visual.groupScale).toBe(1.35)
	})
})
