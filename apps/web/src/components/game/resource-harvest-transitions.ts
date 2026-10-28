import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Resource } from '@hexwardens/game-logic/domains/resource'
import { type TileItem } from '@hexwardens/game-logic/tile/tile-item'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'

export const RESOURCE_HARVEST_DURATION_MS = 320

export interface ResourceHarvest {
	readonly item: Resource
	readonly position: BoardPosition
	readonly terrain: TileTerrain
}

interface ResourceTile {
	readonly terrain: TileTerrain | null
	readonly item: TileItem | null
}

export function isHarvestDestination(
	tile: ResourceTile | null | undefined
): boolean {
	return (
		tile !== undefined &&
		tile !== null &&
		tile.terrain !== null &&
		tile.item === null
	)
}

/** Both snapshots must expose the tile. Losing sight of a resource is not harvesting it. */
export function resourceHarvests(
	before: readonly (readonly (ResourceTile | null)[])[],
	after: readonly (readonly (ResourceTile | null)[])[]
): readonly ResourceHarvest[] {
	const harvested: ResourceHarvest[] = []
	for (const [r_idx, row] of before.entries()) {
		for (const [q_idx, tile] of row.entries()) {
			if (
				tile !== null &&
				tile.terrain !== null &&
				tile.item?.type === 'resource' &&
				isHarvestDestination(after[r_idx]?.[q_idx])
			) {
				harvested.push({
					item: tile.item,
					position: { q_idx, r_idx },
					terrain: tile.terrain
				})
			}
		}
	}
	return harvested
}
