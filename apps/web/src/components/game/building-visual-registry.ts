import {
	type PrimaryBuilding,
	type PrimaryBuildingValue
} from '@hexwardens/game-logic/domains/primary-building'
import {
	type SecondaryBuilding,
	type SecondaryBuildingState,
	type SecondaryBuildingValue
} from '@hexwardens/game-logic/domains/secondary-building'
import {
	type UtilityBuilding,
	type UtilityBuildingValue
} from '@hexwardens/game-logic/domains/utility-building'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { type MeshAssetEntry, type VisualRender } from './visual-registry-types'

export type BuildingVisualItem =
	| PrimaryBuilding
	| SecondaryBuilding
	| UtilityBuilding

export const primaryBuildingVisualRegistry: Record<
	PrimaryBuildingValue,
	MeshAssetEntry
> = {
	tavern: {
		kind: 'mesh',
		path: '/models/buildings/primary/tavern.glb',
		source: 'kaykit'
	},
	farm: {
		kind: 'mesh',
		path: '/models/buildings/primary/farm.glb',
		source: 'kaykit'
	},
	'lumber mill': {
		kind: 'mesh',
		path: '/models/buildings/primary/lumber-mill.glb',
		source: 'kaykit'
	},
	camp: {
		kind: 'mesh',
		path: '/models/buildings/primary/camp.glb',
		source: 'kaykit'
	},
	mine: {
		kind: 'mesh',
		path: '/models/buildings/primary/mine.glb',
		source: 'kaykit'
	}
}

export const secondaryBuildingVisualRegistry: Record<
	SecondaryBuildingValue,
	Record<SecondaryBuildingState, MeshAssetEntry>
> = {
	dock: {
		built: {
			kind: 'mesh',
			path: '/models/buildings/secondary/dock.glb',
			source: 'kaykit'
		},
		large: {
			kind: 'mesh',
			path: '/models/buildings/secondary/dock.glb',
			source: 'kaykit',
			scale: 1.25
		}
	},
	windmill: {
		built: {
			kind: 'mesh',
			path: '/models/buildings/secondary/windmill.glb',
			source: 'kaykit'
		},
		large: {
			kind: 'mesh',
			path: '/models/buildings/secondary/windmill.glb',
			source: 'kaykit',
			scale: 1.25
		}
	},
	watermill: {
		built: {
			kind: 'mesh',
			path: '/models/buildings/secondary/watermill.glb',
			source: 'kaykit'
		},
		large: {
			kind: 'mesh',
			path: '/models/buildings/secondary/watermill.glb',
			source: 'kaykit',
			scale: 1.25
		}
	},
	stables: {
		built: {
			kind: 'mesh',
			path: '/models/buildings/secondary/stables.glb',
			source: 'kaykit'
		},
		large: {
			kind: 'mesh',
			path: '/models/buildings/secondary/stables.glb',
			source: 'kaykit',
			scale: 1.25
		}
	},
	blacksmith: {
		built: {
			kind: 'mesh',
			path: '/models/buildings/secondary/blacksmith.glb',
			source: 'kaykit'
		},
		large: {
			kind: 'mesh',
			path: '/models/buildings/secondary/blacksmith.glb',
			source: 'kaykit',
			scale: 1.25
		}
	}
}

export const utilityBuildingVisualRegistry: Record<
	UtilityBuildingValue,
	MeshAssetEntry
> = {
	roads: {
		kind: 'mesh',
		path: '/models/buildings/utility/roads.glb',
		source: 'kaykit'
	},
	seaport: {
		kind: 'mesh',
		path: '/models/buildings/utility/seaport.glb',
		source: 'kaykit'
	},
	market: {
		kind: 'mesh',
		path: '/models/buildings/utility/market.glb',
		source: 'kaykit'
	}
}

export function getBuildingVisualEntry(
	item: BuildingVisualItem
): MeshAssetEntry {
	switch (item.type) {
		case 'primaryBuilding': {
			return primaryBuildingVisualRegistry[item.value]
		}
		case 'secondaryBuilding': {
			return secondaryBuildingVisualRegistry[item.value][item.state]
		}
		case 'utilityBuilding': {
			return utilityBuildingVisualRegistry[item.value]
		}
		default: {
			return assertNever(item)
		}
	}
}

const BUILDING_MESH_MULTIPLIER = 1.22

/**
 * Resolves a Building to its mesh entry with the shared tile-item
 * multiplier already baked into the scale, so consumers do not encode
 * the Building rendering convention. No outer-group transform — buildings
 * sit at native footprint on the tile surface.
 */
export function resolveBuildingVisual(item: BuildingVisualItem): VisualRender {
	const entry = getBuildingVisualEntry(item)
	return {
		entry,
		groupScale: 1,
		meshScale:
			entry.scale === undefined
				? undefined
				: entry.scale * BUILDING_MESH_MULTIPLIER
	}
}
