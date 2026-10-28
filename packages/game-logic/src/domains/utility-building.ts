import { includesValue } from '../type-utils'
import { type Tech } from './tech'
import { type Tribe } from './tribe'

/**
 * Path-agnostic utility buildings on the Mobility branch (per ADR-0003).
 * Roads and seaports are gated by the `road_and_seaports` tech; the Market is
 * gated by the legacy `guild` tech. Currently these are declared building IDs
 * carried by {@link UtilityBuilding} tile items — full build/economy wiring
 * is intentionally deferred (see #135).
 */
export const utilityBuildings = ['roads', 'seaport', 'market'] as const
export type UtilityBuildingValue = (typeof utilityBuildings)[number]

export type UtilityBuildingState = 'built'

export type UtilityBuilding = {
	type: 'utilityBuilding'
	value: UtilityBuildingValue
	state: UtilityBuildingState
	tribe: Tribe | null
}

export const utilityBuildingToTech: Record<UtilityBuildingValue, Tech> = {
	roads: 'road_and_seaports',
	seaport: 'road_and_seaports',
	market: 'guild'
}

export function isUtilityBuildingValue(
	value: string
): value is UtilityBuildingValue {
	return includesValue(utilityBuildings, value)
}
