import { isWaterTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import {
	type BoardRenderEntry,
	type TileRenderEntry
} from './board-render-data'
import { type BoardWorldPosition } from './board-position-to-world'
import { terrainToMaterialColor } from './board-visual-registry'
import { terrainVisualRegistry } from './terrain-visual-registry'
import { tileElevation } from './tile-elevation'

// Recess applied to land-terrain GLBs so the prism's top rim peeks above the
// mesh top, producing the same dark inter-tile gap that water tiles get for
// free (the hex-water.glb already bakes a 0.2-unit recess into its geometry).
const LAND_MESH_RECESS_Y = 0.08

export interface TerrainInstanceGroup {
	readonly path: string
	readonly color: string
	readonly positions: readonly BoardWorldPosition[]
}

/**
 * Bucket the tile render entries by `(meshPath, color)` so the GLB mesh for
 * each terrain variant is uploaded once and rendered with one drawcall per
 * bucket via `TerrainInstances`. Mountain tiles get their world-y nudged up
 * to the tile peak so the prism's silhouette lines up with the elevation.
 */
export function groupTerrainInstances(
	entries: readonly BoardRenderEntry[]
): readonly TerrainInstanceGroup[] {
	const groups = new Map<
		string,
		{
			path: string
			color: string
			positions: BoardWorldPosition[]
		}
	>()
	for (const entry of entries) {
		if (entry.kind !== 'tile') {
			continue
		}
		appendTileEntry(groups, entry)
	}
	return [...groups.values()]
}

function appendTileEntry(
	groups: Map<
		string,
		{ path: string; color: string; positions: BoardWorldPosition[] }
	>,
	entry: TileRenderEntry
): void {
	const visual = terrainVisualRegistry[entry.tile.terrain]
	const color = terrainToMaterialColor[entry.tile.terrain]
	const key = `${visual.meshPath}|${color}`
	const [wx, wy, wz] = entry.worldPosition
	const { peakY } = tileElevation(entry.tile)
	const recess = isWaterTerrain(entry.tile.terrain) ? 0 : LAND_MESH_RECESS_Y
	const baseY = entry.tile.isMountain ? wy + peakY : wy
	const position: BoardWorldPosition = [wx, baseY - recess, wz]
	const bucket = groups.get(key)
	if (bucket) {
		bucket.positions.push(position)
	} else {
		groups.set(key, { path: visual.meshPath, color, positions: [position] })
	}
}
