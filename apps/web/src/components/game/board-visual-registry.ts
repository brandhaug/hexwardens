import { type Resource } from '@hexwardens/game-logic/domains/resource'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	isHeroUnitType,
	type HeroUnitType,
	type Unit
} from '@hexwardens/game-logic/domains/unit'
import { type Village } from '@hexwardens/game-logic/domains/village'
import { type TileItem } from '@hexwardens/game-logic/tile/tile-item'
import {
	isWaterTerrain,
	type TileTerrain
} from '@hexwardens/game-logic/tile/tile-terrain'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import {
	resolveBuildingVisual,
	type BuildingVisualItem
} from './building-visual-registry'
import { heroVisualRegistry } from './hero-visual-registry'
import {
	resolveResourceVisual,
	type ResourceVisualRender
} from './resource-visual-registry'
import { resolveRuinsVisual } from './ruins-visual-registry'
import {
	unitVisualRegistry,
	waterUnitVisual,
	type UnitProceduralContext
} from './unit-visual-registry'
import { resolveVillageVisual } from './village-visual-registry'
import {
	type MeshAssetEntry,
	type VisualRegistryEntry
} from './visual-registry-types'

export const tribeToMaterialColor: Record<Tribe, string> = {
	barbarians: '#e1292e',
	rogues: '#1f74df',
	druids: '#55b957',
	orcs: '#98201c',
	wraiths: '#9d45dc',
	engineers: '#e5a91a',
	templars: '#13a36e',
	skeletons: '#d4c39b',
	frostkin: '#12bdd0'
}

export const terrainToMaterialColor: Record<TileTerrain, string> = {
	grass: '#82b844',
	snow: '#edf7f6',
	ice: '#a7e3ef',
	stone: '#8a8474',
	forest: '#43a565',
	desert: '#eec95d',
	jungle: '#2fae68',
	swamp: '#6d8f47',
	tundra: '#9fc69a',
	terraced: '#d7b857',
	barren: '#bd7d48',
	water: '#1fb3c4',
	ocean: '#1185a6'
}

export function describeTileItemVisual(item: TileItem): string {
	switch (item.type) {
		case 'primaryBuilding':
		case 'secondaryBuilding':
		case 'utilityBuilding': {
			return titleCase(item.value)
		}
		case 'resource': {
			return titleCase(item.value)
		}
		case 'village': {
			return item.kind === 'capital' ? 'Capital Village' : 'Village'
		}
		case 'ruins': {
			return 'Ruins'
		}
		default: {
			return assertNever(item)
		}
	}
}

function titleCase(value: string): string {
	return value
		.split(/[\s_]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

/**
 * Heroes render a third larger than general units so they read as the
 * army's centerpiece. Applied as the resolved `groupScale` for hero
 * visuals (both on-board hero units and standalone hero showcases).
 */
const HERO_VISUAL_SCALE_BOOST = 1.35

/** A Unit standing on a specific terrain — terrain drives the ship fallback. */
export interface UnitVisualQuery {
	readonly type: 'unit'
	readonly unit: Unit
	readonly terrain: TileTerrain
}

/** A hero rendered outside a match (e.g. the landing showcase). */
export interface HeroVisualQuery {
	readonly type: 'hero'
	readonly heroType: HeroUnitType
}

/**
 * Every domain entity the dispatcher can route to a visual entry. Tile
 * Items reuse their own `type` discriminant; units and standalone heroes
 * add the two query wrappers above.
 */
export type VisualEntity = TileItem | UnitVisualQuery | HeroVisualQuery

export interface VillageVisualResolution {
	readonly type: 'village'
	readonly item: Village
	readonly entry: MeshAssetEntry
	readonly groupScale: number
	readonly meshScale: number | undefined
}

export interface BuildingVisualResolution {
	readonly type: 'building'
	readonly item: BuildingVisualItem
	readonly entry: MeshAssetEntry
	readonly groupScale: number
	readonly meshScale: number | undefined
}

export interface ResourceVisualResolution extends ResourceVisualRender {
	readonly type: 'resource'
	readonly item: Resource
}

export interface RuinsVisualResolution {
	readonly type: 'ruins'
	readonly entry: MeshAssetEntry
	readonly groupScale: number
	readonly meshScale: number | undefined
}

export type TileItemVisualResolution =
	| VillageVisualResolution
	| BuildingVisualResolution
	| ResourceVisualResolution
	| RuinsVisualResolution

export interface UnitVisualResolution {
	readonly type: 'unit'
	/**
	 * Which registry the entry came from: `water` is the shared ship
	 * fallback, `hero` the per-tribe hero mesh, `general` the tribe-tinted
	 * shared unit mesh (or its procedural fallback).
	 */
	readonly variant: 'water' | 'hero' | 'general'
	readonly entry: VisualRegistryEntry<UnitProceduralContext>
	readonly groupScale: number
	/** Tribe tint for general-unit meshes; water and hero meshes are untinted. */
	readonly tintColor: string | undefined
}

export interface HeroVisualResolution {
	readonly type: 'hero'
	readonly entry: MeshAssetEntry
	readonly groupScale: number
}

export type VisualResolution =
	| TileItemVisualResolution
	| UnitVisualResolution
	| HeroVisualResolution

/**
 * Single visual-routing seam (ADR-0005). Render sites hand a domain entity
 * to this dispatcher and receive the registry entry plus the derived render
 * facts they previously re-computed inline: hero-vs-general registry
 * selection, the water-unit → ship fallback, tribe tinting, and group /
 * mesh scale derivation. Render sites keep owning the mesh-vs-procedural
 * JSX, not the selection.
 */
export function getVisualEntry(entity: TileItem): TileItemVisualResolution
export function getVisualEntry(entity: UnitVisualQuery): UnitVisualResolution
export function getVisualEntry(entity: HeroVisualQuery): HeroVisualResolution
export function getVisualEntry(entity: VisualEntity): VisualResolution {
	switch (entity.type) {
		case 'village': {
			const { entry, groupScale, meshScale } = resolveVillageVisual(entity)
			return { type: 'village', item: entity, entry, groupScale, meshScale }
		}
		case 'primaryBuilding':
		case 'secondaryBuilding':
		case 'utilityBuilding': {
			const { entry, groupScale, meshScale } = resolveBuildingVisual(entity)
			return { type: 'building', item: entity, entry, groupScale, meshScale }
		}
		case 'resource': {
			return {
				type: 'resource',
				item: entity,
				...resolveResourceVisual(entity.value)
			}
		}
		case 'ruins': {
			const { entry, groupScale, meshScale } = resolveRuinsVisual()
			return { type: 'ruins', entry, groupScale, meshScale }
		}
		case 'unit': {
			return resolveUnitVisual(entity)
		}
		case 'hero': {
			return {
				type: 'hero',
				entry: heroVisualRegistry[entity.heroType],
				groupScale: HERO_VISUAL_SCALE_BOOST
			}
		}
		default: {
			return assertNever(entity)
		}
	}
}

function resolveUnitVisual({
	unit,
	terrain
}: UnitVisualQuery): UnitVisualResolution {
	// Water shadows everything: any land unit (general or hero) standing on
	// water renders as a ship to mirror the gameplay rule in
	// `getEffectiveUnitStatsForTerrain` that forces land units into boat
	// form. Heroes are not exempted — keep this check above the hero branch.
	if (isWaterTerrain(terrain)) {
		return {
			type: 'unit',
			variant: 'water',
			entry: waterUnitVisual,
			groupScale: 1,
			tintColor: undefined
		}
	}
	if (isHeroUnitType(unit.type)) {
		return {
			type: 'unit',
			variant: 'hero',
			entry: heroVisualRegistry[unit.type],
			groupScale: HERO_VISUAL_SCALE_BOOST,
			tintColor: undefined
		}
	}
	const entry = unitVisualRegistry[unit.type]
	return {
		type: 'unit',
		variant: 'general',
		entry,
		groupScale: 1,
		tintColor:
			entry.kind === 'mesh' ? tribeToMaterialColor[unit.tribe] : undefined
	}
}
