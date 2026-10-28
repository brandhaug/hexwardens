import { type ResourceValue } from '@hexwardens/game-logic/domains/resource'
import {
	type VisualRegistryEntry,
	type VisualRender
} from './visual-registry-types'
import {
	ClayDeposit,
	FishShoal,
	PearlShell,
	WheatPatch
} from './resource-procedural'

export type ResourceProceduralContext = Record<string, never>

export interface ResourcePlacement {
	readonly position: readonly [number, number, number]
	readonly scale: number
	readonly rotation: number
}

const SCATTER: readonly ResourcePlacement[] = [
	{ position: [-0.34, 0, -0.2], scale: 0.43, rotation: -0.35 },
	{ position: [0.31, 0, -0.16], scale: 0.38, rotation: 1.1 },
	{ position: [0.03, 0, 0.34], scale: 0.46, rotation: 2.4 }
]
const DEPOSIT: readonly ResourcePlacement[] = [
	{ position: [-0.2, 0, 0.12], scale: 0.55, rotation: -0.5 },
	{ position: [0.23, 0, 0.18], scale: 0.38, rotation: 1.3 },
	{ position: [0.04, 0, -0.21], scale: 0.65, rotation: 0.5 }
]
const SINGLE: readonly ResourcePlacement[] = [
	{ position: [0, 0, 0], scale: 1, rotation: 0 }
]

type ResourceRegistryEntry = VisualRegistryEntry<ResourceProceduralContext> & {
	readonly placements: readonly ResourcePlacement[]
}

export interface ResourceVisualRender extends VisualRender<
	VisualRegistryEntry<ResourceProceduralContext>
> {
	readonly placements: readonly ResourcePlacement[]
}

/**
 * Resolves a Resource to its visual entry plus the two scale axes the
 * renderer needs. `groupScale` is the uniform outer wrapper; `meshScale`
 * is forwarded to `MeshAsset.scale` (undefined for procedural entries —
 * the consumer calls `entry.render` directly).
 */
export function resolveResourceVisual(
	value: ResourceValue
): ResourceVisualRender {
	const entry = resourceVisualRegistry[value]
	return {
		entry,
		groupScale: 1,
		meshScale: entry.kind === 'mesh' ? entry.scale : undefined,
		placements: entry.placements
	}
}

export const resourceVisualRegistry: Record<
	ResourceValue,
	ResourceRegistryEntry
> = {
	apple: {
		placements: SCATTER,
		kind: 'mesh',
		path: '/models/resources/apple.glb',
		source: 'kaykit'
	},
	iron: {
		placements: DEPOSIT,
		kind: 'mesh',
		path: '/models/resources/iron.glb',
		source: 'kaykit'
	},
	mushroom: {
		placements: SCATTER,
		kind: 'mesh',
		path: '/models/resources/mushroom.glb',
		source: 'kaykit'
	},
	pearl: {
		placements: SINGLE,
		kind: 'procedural',
		render: () => <PearlShell />
	},
	gem: {
		placements: DEPOSIT,
		kind: 'mesh',
		path: '/models/resources/gem.glb',
		source: 'kaykit'
	},
	wheat: {
		placements: SINGLE,
		kind: 'procedural',
		render: () => <WheatPatch />
	},
	berry: {
		placements: SCATTER,
		kind: 'mesh',
		path: '/models/resources/berry.glb',
		source: 'kaykit'
	},
	granite: {
		placements: DEPOSIT,
		kind: 'mesh',
		path: '/models/resources/granite.glb',
		source: 'kaykit'
	},
	herb: {
		placements: SCATTER,
		kind: 'mesh',
		path: '/models/resources/herb.glb',
		source: 'kaykit'
	},
	leather: {
		placements: [{ position: [0, 0, 0], scale: 0.7, rotation: 0.3 }],
		kind: 'mesh',
		path: '/models/resources/leather.glb',
		source: 'kaykit'
	},
	clay: {
		placements: SINGLE,
		kind: 'procedural',
		render: () => <ClayDeposit />
	},
	fish: {
		placements: SINGLE,
		kind: 'procedural',
		render: () => <FishShoal />
	},
	crystal: {
		placements: DEPOSIT,
		kind: 'mesh',
		path: '/models/resources/crystal.glb',
		source: 'kaykit'
	}
}
