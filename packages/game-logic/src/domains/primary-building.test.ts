import { isPrimaryBuildingValue, primaryBuildings } from './primary-building'

describe('primaryBuildings (Hexwardens 5-path roster)', () => {
	const surviving = ['tavern', 'farm', 'lumber mill', 'camp', 'mine'] as const

	const culled = [
		'oasis',
		'ice lodge',
		'coral reef',
		'tree house',
		'shrine',
		'bog hut',
		'longhouse',
		'workshop',
		'outpost',
		'ice cavern'
	] as const

	it('contains exactly the 5 surviving primary buildings', () => {
		expect([...primaryBuildings].toSorted()).toEqual([...surviving].toSorted())
	})

	it.each(surviving)('recognises "%s" as a primary building', (value) => {
		expect(isPrimaryBuildingValue(value)).toBe(true)
	})

	it.each(culled)('rejects culled "%s" at runtime', (value) => {
		expect(isPrimaryBuildingValue(value)).toBe(false)
	})
})
