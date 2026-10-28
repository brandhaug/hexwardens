import { type TileTerrain } from '../tile/tile-terrain.ts'
import { includesValue } from '../type-utils'
import { type Tribe } from './tribe'

/**
 * The 5 Hexwardens-aligned primary (tier-1) buildings. Each maps to one of the
 * five elemental Path families (water / plants / earth / fire / mineral).
 * Twelve visual terrains are still rendered, but a single primary now serves
 * each Path family — see {@link primaryBuildingToTerrains}.
 */
export const primaryBuildings = [
	'tavern', // water Path
	'farm', // plants Path (grass / tundra / snow)
	'lumber mill', // earth Path (forest / jungle / swamp)
	'camp', // fire Path (desert / barren)
	'mine' // mineral Path (stone / terraced / ice)
] as const
export type PrimaryBuildingValue = (typeof primaryBuildings)[number]

export type PrimaryBuildingState = 'idle' | 'built'

export type PrimaryBuilding = {
	type: 'primaryBuilding'
	value: PrimaryBuildingValue
	state: PrimaryBuildingState
	tribe: Tribe | null
}

/** Path-family terrain bundles each primary building can be built on. */
export const primaryBuildingToTerrains: Record<
	PrimaryBuildingValue,
	readonly TileTerrain[]
> = {
	tavern: ['water'],
	farm: ['grass', 'tundra', 'snow'],
	'lumber mill': ['forest', 'jungle', 'swamp'],
	camp: ['desert', 'barren'],
	mine: ['stone', 'terraced', 'ice']
}

export function isPrimaryBuildingValue(
	value: string
): value is PrimaryBuildingValue {
	return includesValue(primaryBuildings, value)
}
