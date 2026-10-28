import { Result } from 'effect'
import {
	Board as BoardModel,
	canMoveTo,
	positionKey,
	type BoardPosition
} from '@hexwardens/game-logic/board/board'
import { GameHex } from '@hexwardens/game-logic/board/hex-utils.ts'
import { getTribeVillageRange } from '@hexwardens/game-logic/board/tribe-range'
import { canAttack } from '@hexwardens/game-logic/combat/range'
import { GAME_CONFIG } from '@hexwardens/game-logic/config'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { getEffectiveUnitStatsForTerrain } from '@hexwardens/game-logic/domains/unit'
import { visibleTileIdsFor } from '@hexwardens/game-logic/fog-of-war/visibility'
import { type GameState } from '@hexwardens/game-logic/game'
import { getCurrentPlayerState } from '@hexwardens/game-logic/player/player-state'
import { type TileState } from '@hexwardens/game-logic/tile/tile'
import {
	boardPositionToWorld,
	type BoardWorldPosition
} from './board-position-to-world'

export interface BoardRenderDataInput {
	readonly gameState: GameState
	readonly currentPlayerTribe: Tribe
	readonly selectedTile: BoardPosition | null
	readonly hexRadius?: number
	readonly spacing?: number
	/**
	 * Storybook / dev-only escape hatch: skip fog-of-war and treat every
	 * non-null tile as visible. Production rendering paths leave this unset —
	 * see `apps/web/AGENTS.md` invariant 1.
	 */
	readonly revealAll?: boolean | undefined
}

export interface BoardRenderData {
	readonly boardRadius: number
	readonly entries: readonly BoardRenderEntry[]
}

export type BoardRenderEntry = TileRenderEntry | FogRenderEntry

export interface FogRenderEntry {
	readonly kind: 'fog'
	readonly position: BoardPosition
	readonly worldPosition: BoardWorldPosition
}

export interface TileRenderEntry {
	readonly kind: 'tile'
	readonly position: BoardPosition
	readonly worldPosition: BoardWorldPosition
	readonly tile: TileState
	readonly isSelected: boolean
	readonly isMoveable: boolean
	readonly isAttackable: boolean
	readonly perimeterSides: readonly boolean[] | null
}

export function deriveBoardRenderData({
	gameState,
	currentPlayerTribe,
	selectedTile,
	hexRadius = 1,
	spacing = GAME_CONFIG.TILE_SPACING,
	revealAll = false
}: BoardRenderDataInput): BoardRenderData {
	const board = gameState.units.board
	const boardRadius = (board.length - 1) / 2
	const visibleTileIds = revealAll
		? null
		: visibleTileIdsFor(gameState, currentPlayerTribe)
	const exploredTileIds = getCurrentPlayerState(
		gameState.playerStates,
		currentPlayerTribe
	).exploration
	const boardModel = BoardModel.from(board)
	const tribeVillageRange = getTribeVillageRange(board, currentPlayerTribe)
	const currentPlayerResearchedTechs = getCurrentPlayerState(
		gameState.playerStates,
		currentPlayerTribe
	).researchedTechs
	const selectedTileData = selectedTile
		? (board[selectedTile.r_idx]?.[selectedTile.q_idx] ?? null)
		: null
	const selectedUnitState = selectedTileData?.unit
		? gameState.units.unitStates[selectedTileData.unit.id]
		: undefined
	const selectedEffectiveUnitStats = selectedTileData?.unit
		? getEffectiveUnitStatsForTerrain(
				selectedTileData.unit.type,
				selectedTileData.terrain
			)
		: null

	const entries: BoardRenderEntry[] = []

	for (const [r_idx, row] of board.entries()) {
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			if (!tile) {
				continue
			}

			const position = { q_idx, r_idx }
			const worldPosition = boardPositionToWorld({
				position,
				boardRadius,
				hexRadius,
				spacing
			})
			const key = positionKey(position)
			const isCurrentlyVisible = !visibleTileIds || visibleTileIds.has(key)
			const isExplored = exploredTileIds[key] === true
			// A tile is "explored" once any of the viewer's units (or village
			// territory) has seen it — explored tiles stay fully revealed forever,
			// rendered identically to currently-visible tiles. Fog of war is the
			// single "unexplored" state: tiles the viewer has never seen.
			// Optimistic movement can extend exploration before the server
			// reveals terrain. A projected fog tile remains fog until that reply.
			// oxlint-disable-next-line typescript/no-unnecessary-condition -- The multiplayer GameState adapter preserves projected null terrain at runtime.
			if (tile.terrain === null || (!isCurrentlyVisible && !isExplored)) {
				entries.push({
					kind: 'fog',
					position,
					worldPosition
				})
				continue
			}

			const isSelected =
				selectedTile?.q_idx === q_idx && selectedTile.r_idx === r_idx
			const isAttackable =
				selectedTile &&
				!isSelected &&
				selectedTileData?.unit &&
				selectedEffectiveUnitStats &&
				(selectedUnitState?.mode === 'ready' ||
					(selectedUnitState?.mode === 'moved' &&
						selectedEffectiveUnitStats.canAttackAfterMove)) &&
				selectedTileData.unit.tribe === currentPlayerTribe
					? canAttack(
							selectedTileData.unit,
							selectedTile,
							tile.unit,
							position,
							GameHex,
							boardRadius,
							currentPlayerResearchedTechs,
							selectedTileData.terrain
						)
					: false
			const isMoveable =
				selectedTile &&
				!isSelected &&
				selectedTileData?.unit &&
				selectedTileData.unit.tribe === currentPlayerTribe &&
				!tile.unit
					? Result.isSuccess(canMoveTo(gameState, selectedTile, position))
					: false
			const isInVillageRange = tribeVillageRange.has(boardModel.key(position))
			const perimeterSides = isInVillageRange
				? boardModel.perimeterSides(position, tribeVillageRange)
				: null

			entries.push({
				kind: 'tile',
				position,
				worldPosition,
				tile,
				isSelected,
				isMoveable,
				isAttackable,
				perimeterSides
			})
		}
	}

	return { boardRadius, entries }
}
