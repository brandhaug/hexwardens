import { type ObstacleKind } from '@hexwardens/game-logic/domains/obstacle'
import { type MeshAssetEntry, type VisualRender } from './visual-registry-types'

export const obstacleVisualRegistry: Record<ObstacleKind, MeshAssetEntry> = {
	boulder: {
		kind: 'mesh',
		path: '/models/decorations/rock-single-a.glb',
		source: 'kaykit'
	},
	'tree-cluster': {
		kind: 'mesh',
		path: '/models/decorations/trees-a-large.glb',
		source: 'kaykit'
	},
	'jungle-bush': {
		kind: 'mesh',
		path: '/models/decorations/bush-4-a.glb',
		source: 'kaykit'
	},
	'gnarled-tree': {
		kind: 'mesh',
		path: '/models/decorations/tree-bare-1-a.glb',
		source: 'kaykit'
	},
	'twisted-tree': {
		kind: 'mesh',
		path: '/models/decorations/tree-bare-2-a.glb',
		source: 'kaykit'
	},
	'sandstone-boulder': {
		kind: 'mesh',
		path: '/models/decorations/rock-single-d.glb',
		source: 'kaykit'
	},
	'small-rocks': {
		kind: 'mesh',
		path: '/models/decorations/rock-single-c.glb',
		source: 'kaykit'
	},
	'tundra-rock': {
		kind: 'mesh',
		path: '/models/decorations/rock-single-e.glb',
		source: 'kaykit'
	}
}

const DEFAULT_OBSTACLE_GROUP_SCALE = 1.3

const obstacleGroupScale: Partial<Record<ObstacleKind, number>> = {
	'tree-cluster': DEFAULT_OBSTACLE_GROUP_SCALE * 1.7
}

export function resolveObstacleVisual(kind: ObstacleKind): VisualRender {
	const entry = obstacleVisualRegistry[kind]
	return {
		entry,
		groupScale: obstacleGroupScale[kind] ?? DEFAULT_OBSTACLE_GROUP_SCALE,
		meshScale: entry.scale
	}
}
