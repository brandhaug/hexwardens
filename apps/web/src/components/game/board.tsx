import { AccessibleBoard } from './accessible-board'
import {
	lazy,
	Suspense,
	useCallback,
	useMemo,
	useState,
	useSyncExternalStore
} from 'react'
import {
	positionKey,
	type BoardPosition
} from '@hexwardens/game-logic/board/board'
import {
	getGamePreferences,
	getServerGamePreferences,
	subscribeGamePreferences
} from '@/lib/game-preferences'
import { HighlightOpacityContext } from './highlight-opacity-context'
import { GAME_CONFIG } from '@hexwardens/game-logic/config'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	getEffectiveMaxHealth,
	type Unit
} from '@hexwardens/game-logic/domains/unit'
import { selectActionableUnits } from '@hexwardens/game-logic/player/actionable-units'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import { type GameState } from '@hexwardens/game-logic/game'
import { canUnitCapture } from '@hexwardens/game-logic/validation/unit'
import { useMomentFeedback } from '@/hooks/use-moment-feedback'
import { useBoardAnimations } from './board-animations'
import { BoardMomentOverlay } from './board-moment-overlay'
import { type BoardWorldPosition } from './board-position-to-world'
import {
	deriveBoardRenderData,
	type BoardRenderEntry
} from './board-render-data'

import { BoardScene, type BoardSceneOverrides } from './board-scene'
import { BoardTileMesh } from './board-tile-mesh'
import { groupTerrainInstances } from './board-terrain-groups'
import { MoveablePulseProvider } from './moveable-pulse-context'
import { TerrainInstances } from './tile-terrain-instances'
import { CaptureBadge } from './capture-badge'
import { tileElevation } from './tile-elevation'
import { ResourceHarvestMiniature } from './resource-harvest'
const UnitMiniature = lazy(() =>
	import('./unit-miniature').then((module) => ({
		default: module.UnitMiniature
	}))
)

interface BoardProps {
	gameState: GameState
	currentPlayerTribe: Tribe
	selectedTile: BoardPosition | null
	onTileSelect: (position: BoardPosition | null) => void
	onCombat: (
		attackerPosition: BoardPosition,
		defenderPosition: BoardPosition
	) => void
	onMovement: (fromPosition: BoardPosition, toPosition: BoardPosition) => void
	/**
	 * Storybook / dev escape hatch — bypass fog and render every tile.
	 * Production callers leave this unset.
	 */
	revealAll?: boolean
	/**
	 * Storybook camera/orbit overrides for scene framing. Production callers
	 * leave this unset.
	 */
	sceneOverrides?: BoardSceneOverrides
}

const HEX_RADIUS = 1
const UNIT_TOP_Y = 0.18

interface BoardUnit {
	readonly unit: Unit
	readonly terrain: TileTerrain
	readonly worldPosition: BoardWorldPosition
	readonly topY: number
}

export function Board({
	gameState,
	currentPlayerTribe,
	selectedTile,
	onTileSelect,
	onCombat,
	onMovement,
	revealAll,
	sceneOverrides
}: BoardProps) {
	const board = gameState.units.board
	const activeMoments = useMomentFeedback(gameState)
	// One subscription for the whole board — propagated to each TileHighlight
	// via HighlightOpacityContext so 200 tiles share a single listener instead
	// of registering 200 of them.
	const highlightOpacityScale = useSyncExternalStore(
		subscribeGamePreferences,
		() => getGamePreferences().highlightOpacity,
		() => getServerGamePreferences().highlightOpacity
	)

	const renderData = useMemo(
		() =>
			deriveBoardRenderData({
				gameState,
				currentPlayerTribe,
				selectedTile,
				hexRadius: HEX_RADIUS,
				spacing: GAME_CONFIG.TILE_SPACING,
				revealAll
			}),
		[gameState, currentPlayerTribe, selectedTile, revealAll]
	)

	const animations = useBoardAnimations({
		gameState,
		boardRadius: renderData.boardRadius,
		hexRadius: HEX_RADIUS,
		spacing: GAME_CONFIG.TILE_SPACING
	})

	const units = useMemo<BoardUnit[]>(() => {
		const list: BoardUnit[] = []
		for (const entry of renderData.entries) {
			if (entry.kind !== 'tile' || !entry.tile.unit) {
				continue
			}
			list.push({
				unit: entry.tile.unit,
				terrain: entry.tile.terrain,
				worldPosition: entry.worldPosition,
				topY: UNIT_TOP_Y + tileElevation(entry.tile).peakY
			})
		}
		return list
	}, [renderData.entries])

	const terrainInstanceGroups = useMemo(
		() => groupTerrainInstances(renderData.entries),
		[renderData.entries]
	)
	// Compute once on mount: recomputing as fog reveals tiles shifts the
	// OrbitControls target, which manifests as the camera rotating during moves.
	// oxlint-disable-next-line react/hook-use-state -- The value is created once per mount and intentionally has no updates.
	const [initialTarget] = useState(() =>
		boardCenter(renderData.entries, currentPlayerTribe, revealAll)
	)

	// Single pass over the current player's units yields both:
	//  - `actionableUnitIds`: gold ring under units that still have a move/attack.
	//  - `captureSites`: gold "!" over enemy villages a friendly unit can capture.
	// Depends on `gameState.units` rather than the whole `gameState` so unrelated
	// dispatches don't bust the memo.
	const { actionableUnitIds, captureSites } = useMemo(() => {
		const ids = new Set<string>()
		for (const a of selectActionableUnits(gameState, currentPlayerTribe)) {
			ids.add(a.unit.id)
		}
		const sites: {
			readonly key: string
			readonly worldPosition: BoardWorldPosition
		}[] = []
		for (const entry of renderData.entries) {
			if (entry.kind !== 'tile') {
				continue
			}
			const tile = entry.tile
			if (tile.item?.type !== 'village') {
				continue
			}
			if (tile.item.tribe === currentPlayerTribe) {
				continue
			}
			const unit = tile.unit
			if (!unit || unit.tribe !== currentPlayerTribe) {
				continue
			}
			const unitState = gameState.units.unitStates[unit.id]
			if (!canUnitCapture(unitState, unit)) {
				continue
			}
			sites.push({
				key: positionKey(entry.position),
				worldPosition: entry.worldPosition
			})
		}
		return { actionableUnitIds: ids, captureSites: sites }
	}, [renderData.entries, currentPlayerTribe, gameState])

	const [hoveredKey, setHoveredKey] = useState<string | null>(null)

	const selectedTileData = selectedTile
		? (board[selectedTile.r_idx]?.[selectedTile.q_idx] ?? null)
		: null

	const handleEntryClick = useCallback(
		(entry: BoardRenderEntry) => {
			if (entry.kind === 'fog') {
				onTileSelect(entry.position)
				return
			}

			if (
				entry.isAttackable &&
				selectedTile &&
				selectedTileData?.unit &&
				entry.tile.unit
			) {
				onCombat(selectedTile, entry.position)
				return
			}

			if (entry.isMoveable && selectedTile && selectedTileData?.unit) {
				onMovement(selectedTile, entry.position)
				return
			}

			onTileSelect(entry.position)
		},
		[onCombat, onMovement, onTileSelect, selectedTile, selectedTileData]
	)

	return (
		<>
			<AccessibleBoard
				entries={renderData.entries}
				onActivate={handleEntryClick}
				onClear={() => onTileSelect(null)}
			/>
			<BoardScene initialTarget={initialTarget} overrides={sceneOverrides}>
				<MoveablePulseProvider>
					<HighlightOpacityContext.Provider value={highlightOpacityScale}>
						<group position={[0, 0, 0]}>
							{terrainInstanceGroups.map((group) => (
								<TerrainInstances
									key={`${group.path}|${group.color}`}
									path={group.path}
									color={group.color}
									positions={group.positions}
								/>
							))}
							{renderData.entries.map((entry) => {
								const key = `${entry.position.q_idx}-${entry.position.r_idx}`
								return (
									<BoardTileMesh
										key={key}
										entry={entry}
										isHovered={hoveredKey === key}
										onEntryClick={handleEntryClick}
										onHover={(hovered) =>
											setHoveredKey((current) => {
												if (hovered) {
													return key
												}
												return current === key ? null : current
											})
										}
									/>
								)
							})}
							<Suspense fallback={null}>
								{units.map((u) => {
									const unitState = gameState.units.unitStates[u.unit.id]
									const health = unitState?.health ?? 0
									const maxHealth = unitState
										? getEffectiveMaxHealth(u.unit.type, unitState)
										: health
									return (
										<UnitMiniature
											key={u.unit.id}
											unit={u.unit}
											terrain={u.terrain}
											health={health}
											maxHealth={maxHealth}
											worldPosition={u.worldPosition}
											topY={u.topY}
											hasAction={actionableUnitIds.has(u.unit.id)}
											moveAnimation={animations.getUnitMove(u.unit.id)}
											animationOverride={animations.getUnitAnimation(u.unit.id)}
										/>
									)
								})}
							</Suspense>
							{captureSites.map((site) => (
								<CaptureBadge
									key={`cap-${site.key}`}
									worldPosition={site.worldPosition}
								/>
							))}
							<Suspense fallback={null}>
								{animations.harvests.map((harvest) => (
									<ResourceHarvestMiniature
										key={harvest.key}
										animation={harvest}
									/>
								))}
								{animations.defeats.map((defeat) => (
									<UnitMiniature
										key={defeat.key}
										unit={defeat.unit}
										terrain={defeat.terrain}
										health={0}
										maxHealth={0}
										worldPosition={defeat.worldPosition}
										topY={
											UNIT_TOP_Y +
											tileElevation({
												terrain: defeat.terrain,
												isMountain: defeat.isMountain
											}).peakY
										}
										animationOverride={defeat.animation}
										showHud={false}
									/>
								))}
							</Suspense>
							<BoardMomentOverlay
								activeMoments={activeMoments}
								board={board}
								boardRadius={renderData.boardRadius}
								hexRadius={HEX_RADIUS}
							/>
						</group>
					</HighlightOpacityContext.Provider>
				</MoveablePulseProvider>
			</BoardScene>
		</>
	)
}

function boardCenter(
	entries: readonly BoardRenderEntry[],
	tribe: Tribe,
	revealAll = false
): readonly [number, number, number] {
	let x = 0
	let z = 0
	let count = 0
	let ownedPosition: BoardWorldPosition | undefined
	for (const entry of entries) {
		if (entry.kind === 'fog') {
			continue
		}
		const { tile } = entry
		const [wx, , wz] = entry.worldPosition
		if (!revealAll) {
			if (tile.item?.type === 'village' && tile.item.tribe === tribe) {
				if (tile.item.kind === 'capital') {
					return [wx, 0, wz]
				}
				ownedPosition = [wx, 0, wz]
			} else if (!ownedPosition && tile.unit?.tribe === tribe) {
				ownedPosition = [wx, 0, wz]
			}
		}
		x += wx
		z += wz
		count++
	}
	if (ownedPosition) {
		return ownedPosition
	}
	if (count === 0) {
		return [0, 0, 0]
	}
	return [x / count, 0, z / count]
}
