import { isWaterTerrain, terrains, terrainToFilterId } from './tile-terrain'

describe('tileTerrain', () => {
	it('includes both shallow water and deep ocean as terrain literals', () => {
		expect(terrains).toContain('water')
		expect(terrains).toContain('ocean')
	})

	it('exposes a filter id for the ocean terrain', () => {
		expect(terrainToFilterId.ocean).toBe('terrain-ocean')
	})

	it('treats both water and ocean as water terrain via isWaterTerrain', () => {
		expect(isWaterTerrain('water')).toBe(true)
		expect(isWaterTerrain('ocean')).toBe(true)
		expect(isWaterTerrain('grass')).toBe(false)
		expect(isWaterTerrain('stone')).toBe(false)
	})
})
