import {
	isSecondaryBuildingValue,
	secondaryBuildings,
	secondaryBuildingToMastery
} from './secondary-building'

describe('secondaryBuildings (Hexwardens 5-path roster)', () => {
	const surviving = [
		'dock',
		'windmill',
		'watermill',
		'stables',
		'blacksmith'
	] as const

	const culled = [
		'glass workshop',
		'leather trader',
		'bowyer',
		'forge',
		'herbalist',
		'peat farm',
		'shipwright',
		'pottery',
		'scavenger post',
		'frost forge'
	] as const

	it('contains exactly the 5 surviving secondary buildings', () => {
		expect([...secondaryBuildings].toSorted()).toEqual(
			[...surviving].toSorted()
		)
	})

	it.each(surviving)('recognises "%s" as a secondary building', (value) => {
		expect(isSecondaryBuildingValue(value)).toBe(true)
	})

	it.each(culled)('rejects culled "%s" at runtime', (value) => {
		expect(isSecondaryBuildingValue(value)).toBe(false)
	})
})

describe('secondaryBuildingToMastery (Large upgrade gate)', () => {
	it('maps each secondary to its Path Mastery tech', () => {
		expect(secondaryBuildingToMastery).toEqual({
			dock: 'water_mastery',
			windmill: 'plant_mastery',
			watermill: 'earth_mastery',
			stables: 'fire_mastery',
			blacksmith: 'mineral_mastery'
		})
	})
})
