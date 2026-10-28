import {
	isUtilityBuildingValue,
	utilityBuildings,
	utilityBuildingToTech
} from './utility-building'

describe('utilityBuildings (Hexwardens mobility utilities)', () => {
	const expected = ['roads', 'seaport', 'market'] as const

	it('contains the 3 utility buildings', () => {
		expect([...utilityBuildings].toSorted()).toEqual([...expected].toSorted())
	})

	it.each(expected)('recognises "%s" as a utility building', (value) => {
		expect(isUtilityBuildingValue(value)).toBe(true)
	})

	it('rejects unrelated values', () => {
		expect(isUtilityBuildingValue('forge')).toBe(false)
		expect(isUtilityBuildingValue('')).toBe(false)
	})

	it('maps each utility to the tech that unlocks it', () => {
		expect(utilityBuildingToTech).toEqual({
			roads: 'road_and_seaports',
			seaport: 'road_and_seaports',
			market: 'guild'
		})
	})
})
