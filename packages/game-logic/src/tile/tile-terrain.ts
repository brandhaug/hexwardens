const landTerrains = [
	'grass',
	'snow',
	'ice',
	'stone',
	'forest',
	'desert',
	'jungle',
	'swamp',
	'tundra',
	'terraced',
	'barren'
] as const

const waterTerrains = ['water', 'ocean'] as const

export const terrains = [...landTerrains, ...waterTerrains] as const

export type TileTerrain = (typeof terrains)[number]

export const terrainToFilterId: Record<TileTerrain, string> = {
	grass: 'terrain-grass',
	snow: 'terrain-snow',
	stone: 'terrain-stone',
	water: 'terrain-water',
	ocean: 'terrain-ocean',
	forest: 'terrain-forest',
	desert: 'terrain-desert',
	jungle: 'terrain-jungle',
	swamp: 'terrain-swamp',
	tundra: 'terrain-tundra',
	terraced: 'terrain-terraced',
	barren: 'terrain-barren',
	ice: 'terrain-ice'
}

/**
 * True for the terrains units treat as "in the water" — shallow `water`
 * and deep `ocean`. Both put land units into boat form and use
 * `waterMovement` budgets; the gating between them lives in movement
 * validation (see `board.canMoveTo`).
 */
export function isWaterTerrain(terrain: TileTerrain): boolean {
	return includesValue(waterTerrains, terrain)
}
import { includesValue } from '../type-utils'
