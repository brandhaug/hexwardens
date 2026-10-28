import { includesValue } from '../type-utils'
import { type PrimaryBuildingValue } from './primary-building'
import { type Tech } from './tech'
import { type Tribe } from './tribe'

/**
 * The 5 Hexwardens-aligned secondary (tier-2) buildings — one per Path family.
 * Each is built on an empty tile adjacent to its matching primary, and can be
 * upgraded to a Large variant once the path's Mastery tech is researched
 * (see {@link secondaryBuildingToMastery}).
 */
export const secondaryBuildings = [
	'dock', // water Path — adjacent to tavern
	'windmill', // plants Path — adjacent to farm
	'watermill', // earth Path — adjacent to lumber mill
	'stables', // fire Path — adjacent to camp
	'blacksmith' // mineral Path — adjacent to mine
] as const
export type SecondaryBuildingValue = (typeof secondaryBuildings)[number]

/** `built` is the standard tier-2 form; `large` is the Mastery-gated upgrade. */
export type SecondaryBuildingState = 'built' | 'large'

export type SecondaryBuilding = {
	type: 'secondaryBuilding'
	value: SecondaryBuildingValue
	state: SecondaryBuildingState
	tribe: Tribe | null
}

export const primaryBuildingToSecondaryBuilding: Record<
	PrimaryBuildingValue,
	SecondaryBuildingValue
> = {
	tavern: 'dock',
	farm: 'windmill',
	'lumber mill': 'watermill',
	camp: 'stables',
	mine: 'blacksmith'
}

/**
 * Mastery tech that unlocks the Large upgrade for each secondary building.
 * Per ADR-0003: each Path's Mastery turns its tier-2 building into the Large
 * variant.
 */
export const secondaryBuildingToMastery: Record<SecondaryBuildingValue, Tech> =
	{
		dock: 'water_mastery',
		windmill: 'plant_mastery',
		watermill: 'earth_mastery',
		stables: 'fire_mastery',
		blacksmith: 'mineral_mastery'
	}

export function isSecondaryBuildingValue(
	value: string
): value is SecondaryBuildingValue {
	return includesValue(secondaryBuildings, value)
}
