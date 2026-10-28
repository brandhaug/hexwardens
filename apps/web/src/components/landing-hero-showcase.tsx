/* eslint-disable react/no-unknown-property */
import { lazy, Suspense, useMemo } from 'react'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { GAME_CONFIG } from '@hexwardens/game-logic/config'
import {
	type Tribe,
	tribeToTerrain,
	tribeToTribeStats
} from '@hexwardens/game-logic/domains/tribe'
import { type TileState } from '@hexwardens/game-logic/tile/tile'
import { boardPositionToWorld } from '@/components/game/board-position-to-world'
import {
	type FogRenderEntry,
	type TileRenderEntry
} from '@/components/game/board-render-data'
import {
	BoardScene,
	type BoardSceneOverrides
} from '@/components/game/board-scene'
import {
	groupTerrainInstances,
	type TerrainInstanceGroup
} from '@/components/game/board-terrain-groups'
import { BoardTileMesh } from '@/components/game/board-tile-mesh'
import { getVisualEntry } from '@/components/game/board-visual-registry'
import { TerrainInstances } from '@/components/game/tile-terrain-instances'

const AnimatedMeshAsset = lazy(() =>
	import('@/components/game/unit-miniature').then((module) => ({
		default: module.AnimatedMeshAsset
	}))
)

const BOARD_RADIUS = 3
const VISIBLE_RADIUS = 1
const HEX_RADIUS = 1

const SHOWCASE_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 4.2, 5.2],
	cameraFov: 36,
	fogNear: 10,
	fogFar: 24,
	minDistance: 3.5,
	maxDistance: 12
}

// Distance-1 axial offsets to mark as water, so the visible foreground has
// terrain variety. The remaining ring tiles keep the tribe's home biome.
const WATER_OFFSETS: ReadonlyArray<{ readonly q: number; readonly r: number }> =
	[
		{ q: 1, r: -1 },
		{ q: -1, r: 1 },
		{ q: 0, r: 1 }
	]

const WATER_KEYS = new Set(WATER_OFFSETS.map((o) => `${o.q}|${o.r}`))

const HERO_GROUND_SCALE = 1.22

interface HexAxial {
	readonly q: number
	readonly r: number
}

function axialPositionsWithin(radius: number): readonly HexAxial[] {
	const positions: HexAxial[] = []
	for (let q = -radius; q <= radius; q++) {
		const rMin = Math.max(-radius, -q - radius)
		const rMax = Math.min(radius, -q + radius)
		for (let r = rMin; r <= rMax; r++) {
			positions.push({ q, r })
		}
	}
	return positions
}

function axialDistance(a: HexAxial): number {
	return (Math.abs(a.q) + Math.abs(a.r) + Math.abs(a.q + a.r)) / 2
}

function makeTile(
	q: number,
	r: number,
	terrain: TileState['terrain']
): TileState {
	return {
		hex: { q, r, s: -q - r },
		terrain,
		item: null,
		unit: null,
		isMountain: false,
		obstacle: null
	}
}

interface ShowcaseLayout {
	readonly visibleEntries: readonly TileRenderEntry[]
	readonly fogEntries: readonly FogRenderEntry[]
	readonly heroWorld: readonly [number, number, number]
	readonly terrainGroups: readonly TerrainInstanceGroup[]
}

function buildLayout(tribe: Tribe): ShowcaseLayout {
	const homeTerrain = tribeToTerrain[tribe]
	const positions = axialPositionsWithin(BOARD_RADIUS)
	const visibleEntries: TileRenderEntry[] = []
	const fogEntries: FogRenderEntry[] = []

	for (const axial of positions) {
		const boardPosition: BoardPosition = {
			q_idx: axial.q + BOARD_RADIUS,
			r_idx: axial.r + BOARD_RADIUS
		}
		const worldPosition = boardPositionToWorld({
			position: boardPosition,
			boardRadius: BOARD_RADIUS,
			hexRadius: HEX_RADIUS,
			spacing: GAME_CONFIG.TILE_SPACING
		})
		const dist = axialDistance(axial)

		if (dist > VISIBLE_RADIUS) {
			fogEntries.push({
				kind: 'fog',
				position: boardPosition,
				worldPosition
			})
			continue
		}

		const isWater = dist === 1 && WATER_KEYS.has(`${axial.q}|${axial.r}`)
		const terrain: TileState['terrain'] = isWater ? 'water' : homeTerrain
		visibleEntries.push({
			kind: 'tile',
			position: boardPosition,
			worldPosition,
			tile: makeTile(axial.q, axial.r, terrain),
			isSelected: false,
			isMoveable: false,
			isAttackable: false,
			perimeterSides: null
		})
	}

	const heroBoardPosition: BoardPosition = {
		q_idx: BOARD_RADIUS,
		r_idx: BOARD_RADIUS
	}
	const heroWorld = boardPositionToWorld({
		position: heroBoardPosition,
		boardRadius: BOARD_RADIUS,
		hexRadius: HEX_RADIUS,
		spacing: GAME_CONFIG.TILE_SPACING
	})

	return {
		visibleEntries,
		fogEntries,
		heroWorld,
		terrainGroups: groupTerrainInstances(visibleEntries)
	}
}

interface LandingHeroShowcaseProps {
	readonly tribe: Tribe
}

export function LandingHeroShowcase({ tribe }: LandingHeroShowcaseProps) {
	const layout = useMemo(() => buildLayout(tribe), [tribe])
	const heroType = tribeToTribeStats[tribe].heroUnit
	const heroVisual = getVisualEntry({ type: 'hero', heroType })
	const entry = heroVisual.entry
	const rig = entry.rig
	const heroScale = HERO_GROUND_SCALE * heroVisual.groupScale

	return (
		<BoardScene initialTarget={[0, 0, 0]} overrides={SHOWCASE_OVERRIDES}>
			{layout.terrainGroups.map((group) => (
				<TerrainInstances
					key={`${group.path}|${group.color}`}
					path={group.path}
					color={group.color}
					positions={group.positions}
				/>
			))}
			{layout.visibleEntries.map((tileEntry) => (
				<BoardTileMesh
					key={`tile:${tileEntry.position.q_idx}:${tileEntry.position.r_idx}`}
					entry={tileEntry}
				/>
			))}
			{layout.fogEntries.map((fogEntry) => (
				<BoardTileMesh
					key={`fog:${fogEntry.position.q_idx}:${fogEntry.position.r_idx}`}
					entry={fogEntry}
				/>
			))}
			{rig && (
				<group
					position={[layout.heroWorld[0], 0, layout.heroWorld[2]]}
					scale={[heroScale, heroScale, heroScale]}
				>
					<Suspense fallback={null}>
						<AnimatedMeshAsset
							entry={entry}
							rig={rig}
							animationState='idle'
							animationToken={0}
							reducedMotion={false}
						/>
					</Suspense>
				</group>
			)}
		</BoardScene>
	)
}
