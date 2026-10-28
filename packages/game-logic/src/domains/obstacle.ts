/**
 * Obstacles are passive, movement-blocking terrain features — boulders,
 * tree clusters, dead trees, bushes — modelled as a sibling field on
 * `TileState` (`obstacle: ObstacleKind | null`) per ADR-0007. They spawn
 * deterministically during board generation on eligible land terrains
 * (see `obstacleTerrains`), are hard-blocked by ground units, bypassed by
 * flying units, and stripped under fog of war like tile items.
 */
import { type TileTerrain } from '../tile/tile-terrain.ts'

export const obstacleKinds = [
	'boulder',
	'tree-cluster',
	'jungle-bush',
	'gnarled-tree',
	'twisted-tree',
	'sandstone-boulder',
	'small-rocks',
	'tundra-rock'
] as const

export type ObstacleKind = (typeof obstacleKinds)[number]

export const obstacleTerrains = [
	'grass',
	'forest',
	'jungle',
	'swamp',
	'desert',
	'barren',
	'terraced',
	'tundra',
	'snow',
	'ice'
] as const satisfies readonly TileTerrain[]

export type ObstacleTerrain = (typeof obstacleTerrains)[number]

const obstacleTerrainSet: ReadonlySet<TileTerrain> = new Set(obstacleTerrains)

export const terrainToObstacleKind: Record<ObstacleTerrain, ObstacleKind> = {
	grass: 'boulder',
	forest: 'tree-cluster',
	jungle: 'jungle-bush',
	swamp: 'gnarled-tree',
	desert: 'sandstone-boulder',
	barren: 'twisted-tree',
	terraced: 'small-rocks',
	tundra: 'tundra-rock',
	snow: 'gnarled-tree',
	ice: 'tundra-rock'
}

export function isObstacleTerrain(
	terrain: TileTerrain
): terrain is ObstacleTerrain {
	return obstacleTerrainSet.has(terrain)
}
