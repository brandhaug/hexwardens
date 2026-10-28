import { type ReadonlyData } from '../type-utils'
import { type BoardPosition, type HexCoordinate } from '../board/position'
import { type ObstacleKind } from '../domains/obstacle'
import { type Unit } from '../domains/unit'
import { type TileItem } from './tile-item'
import { type TileTerrain } from './tile-terrain.ts'

export type TileState = {
	hex: HexCoordinate
	terrain: TileTerrain
	item: TileItem | null
	unit: Unit | null
	isMountain: boolean
	obstacle: ObstacleKind | null
}

export type TileGrid = ReadonlyData<(TileState | null)[][]>

export const createTile = ({ r, q }: { r: number; q: number }): TileState => ({
	hex: { r, q, s: -q - r },
	terrain: 'grass',
	item: null,
	unit: null,
	isMountain: false,
	obstacle: null
})

/**
 * Immutable tile-grid update — clones only the affected row and tile.
 * Prefer `Board.update` when working through a Board instance.
 */
export function updateTile(
	board: TileGrid,
	pos: BoardPosition,
	updates: Partial<TileState>
): TileGrid {
	const row = board[pos.r_idx]
	const tile = row?.[pos.q_idx]
	if (!row || !tile) {
		return board
	}
	const newRow = [...row]
	newRow[pos.q_idx] = { ...tile, ...updates }
	const newBoard = [...board]
	newBoard[pos.r_idx] = newRow
	return newBoard
}
