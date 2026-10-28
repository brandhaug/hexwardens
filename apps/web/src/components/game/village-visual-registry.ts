import {
	type Village,
	type VillageLevel
} from '@hexwardens/game-logic/domains/village'
import { isCapitalVillage } from './capital-village'
import { type MeshAssetEntry, type VisualRender } from './visual-registry-types'

export type VillageVisualKey =
	| 'village-small'
	| 'village'
	| 'village-large'
	| 'capital'

export const villageVisualRegistry: Record<VillageVisualKey, MeshAssetEntry> = {
	'village-small': {
		kind: 'mesh',
		path: '/models/villages/village-small.glb',
		source: 'kaykit'
	},
	village: {
		kind: 'mesh',
		path: '/models/villages/village.glb',
		source: 'kaykit'
	},
	'village-large': {
		kind: 'mesh',
		path: '/models/villages/village-large.glb',
		source: 'kaykit'
	},
	capital: {
		kind: 'mesh',
		path: '/models/villages/capital.glb',
		source: 'kaykit'
	}
}

const VILLAGE_MESH_MULTIPLIER = 1.26

/**
 * Resolves a Village to its mesh entry plus the two scale axes the
 * renderer needs: a level-driven outer-group `groupScale` (Capital + level
 * 1 baseline 1.0 grows to ~1.4 at level 13 — enough to read as "this
 * Village matters" without dwarfing adjacent units) and a per-mesh scale
 * that applies the tile-item Village multiplier on top of any registry
 * scale override.
 */
export function resolveVillageVisual(village: Village): VisualRender {
	const key: VillageVisualKey = isCapitalVillage(village)
		? 'capital'
		: villageTierKey(village.level)
	const entry = villageVisualRegistry[key]
	return {
		entry,
		groupScale: villageLevelScale(village.level),
		meshScale:
			entry.scale === undefined
				? undefined
				: entry.scale * VILLAGE_MESH_MULTIPLIER
	}
}

function villageLevelScale(level: VillageLevel): number {
	return 1.04 + (level - 1) * 0.04
}

function villageTierKey(
	level: VillageLevel
): Extract<VillageVisualKey, 'village-small' | 'village' | 'village-large'> {
	if (level <= 3) {
		return 'village-small'
	}
	if (level <= 7) {
		return 'village'
	}
	return 'village-large'
}
