import {
	isWaterTerrain,
	type TileTerrain
} from '@hexwardens/game-logic/tile/tile-terrain'

const LAND_PRISM_HEIGHT = 0.48
const WATER_PRISM_HEIGHT = 0.18
const MOUNTAIN_LIFT = 0.32

export interface TileElevation {
	/**
	 * Flat tile top where passive Tile Items (Building, Village, Resource, Ruins)
	 * rest. Does not rise for mountain Tiles — items sit on the foot of the
	 * mountain, not its peak.
	 */
	readonly surfaceY: number
	/**
	 * Top of the rendered terrain prism — where obstacles, the terrain GLB,
	 * highlights, owner rings, and tile-edge effects ride. For mountain Tiles
	 * this is `surfaceY + MOUNTAIN_LIFT`; otherwise equal to `surfaceY`.
	 */
	readonly peakY: number
	/**
	 * Vertical extent of the prism mesh — water Tiles render shorter, mountain
	 * Tiles render taller by `MOUNTAIN_LIFT`.
	 */
	readonly prismHeight: number
}

export function tileElevation(
	tile: Readonly<{ terrain: TileTerrain; isMountain: boolean }>
): TileElevation {
	const baseHeight = isWaterTerrain(tile.terrain)
		? WATER_PRISM_HEIGHT
		: LAND_PRISM_HEIGHT
	const lift = tile.isMountain ? MOUNTAIN_LIFT : 0
	return {
		surfaceY: 0,
		peakY: lift,
		prismHeight: baseHeight + lift
	}
}
