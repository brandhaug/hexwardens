import { type Unit, type UnitId, type UnitState } from '../domains/unit'
import { updateTile, type TileGrid } from '../tile/tile'
import {
	addUnitState,
	removeUnitState,
	updateUnitPosition,
	type UnitStateRecord
} from '../unit-state-utils'
import { typedKeys } from '../type-utils'
import { type BoardPosition } from './position'

export type UnitPlacement = {
	board: TileGrid
	unitStates: UnitStateRecord
}

export class BoardUnitInvariantError extends Error {
	constructor(message: string) {
		super(`Board/unitStates invariant violated: ${message}`)
		this.name = 'BoardUnitInvariantError'
	}
}

function tileAt(board: TileGrid, pos: BoardPosition) {
	return board[pos.r_idx]?.[pos.q_idx] ?? null
}

/**
 * Place a new unit on an empty tile and register its UnitState. Caller must
 * supply a state whose `position` matches `pos` — enforced here.
 */
export function placeUnit(
	board: TileGrid,
	unitStates: UnitStateRecord,
	pos: BoardPosition,
	unit: Unit,
	state: UnitState
): UnitPlacement {
	const tile = tileAt(board, pos)
	if (!tile) {
		throw new BoardUnitInvariantError(
			`placeUnit: no tile at (${pos.q_idx}, ${pos.r_idx})`
		)
	}
	if (tile.unit) {
		throw new BoardUnitInvariantError(
			`placeUnit: tile (${pos.q_idx}, ${pos.r_idx}) already holds unit ${tile.unit.id}`
		)
	}
	if (unitStates[unit.id]) {
		throw new BoardUnitInvariantError(
			`placeUnit: UnitState already exists for ${unit.id}`
		)
	}
	if (
		state.position.q_idx !== pos.q_idx ||
		state.position.r_idx !== pos.r_idx
	) {
		throw new BoardUnitInvariantError(
			`placeUnit: state.position (${state.position.q_idx}, ${state.position.r_idx}) does not match tile (${pos.q_idx}, ${pos.r_idx})`
		)
	}
	return {
		board: updateTile(board, pos, { unit }),
		unitStates: addUnitState(unitStates, unit.id, state)
	}
}

/**
 * Remove a unit from the board and drop its UnitState. The unit's board tile
 * is inferred from its current `UnitState.position`.
 */
export function removeUnit(
	board: TileGrid,
	unitStates: UnitStateRecord,
	unitId: UnitId
): UnitPlacement {
	const state = unitStates[unitId]
	if (!state) {
		throw new BoardUnitInvariantError(`removeUnit: no UnitState for ${unitId}`)
	}
	const pos = state.position
	const tile = tileAt(board, pos)
	if (!tile) {
		throw new BoardUnitInvariantError(
			`removeUnit: no tile at (${pos.q_idx}, ${pos.r_idx}) for unit ${unitId}`
		)
	}
	if (tile.unit?.id !== unitId) {
		throw new BoardUnitInvariantError(
			`removeUnit: tile (${pos.q_idx}, ${pos.r_idx}) holds ${tile.unit?.id ?? 'no unit'}, expected ${unitId}`
		)
	}
	let nextBoard = updateTile(board, pos, { unit: null })
	const home = state.homeVillage
	const village = home ? tileAt(nextBoard, home)?.item : null
	if (
		home &&
		village?.type === 'village' &&
		village.tribe === tile.unit.tribe
	) {
		nextBoard = updateTile(nextBoard, home, {
			item: { ...village, population: Math.max(0, village.population - 1) }
		})
	}
	return {
		board: nextBoard,
		unitStates: removeUnitState(unitStates, unitId)
	}
}

/**
 * Move a unit from its current tile to `to`. Position in the unit's state is
 * synced with the new tile. Mode/health are not touched — keep those concerns
 * with the caller.
 */
export function moveUnit(
	board: TileGrid,
	unitStates: UnitStateRecord,
	unitId: UnitId,
	to: BoardPosition
): UnitPlacement {
	const state = unitStates[unitId]
	if (!state) {
		throw new BoardUnitInvariantError(`moveUnit: no UnitState for ${unitId}`)
	}
	const from = state.position
	const fromTile = tileAt(board, from)
	if (!fromTile || fromTile.unit?.id !== unitId) {
		throw new BoardUnitInvariantError(
			`moveUnit: unit ${unitId} is not on tile (${from.q_idx}, ${from.r_idx})`
		)
	}
	const toTile = tileAt(board, to)
	if (!toTile) {
		throw new BoardUnitInvariantError(
			`moveUnit: no tile at destination (${to.q_idx}, ${to.r_idx})`
		)
	}
	if (from.q_idx === to.q_idx && from.r_idx === to.r_idx) {
		return { board, unitStates }
	}
	if (toTile.unit) {
		throw new BoardUnitInvariantError(
			`moveUnit: destination (${to.q_idx}, ${to.r_idx}) already holds unit ${toTile.unit.id}`
		)
	}
	const unit = fromTile.unit
	let newBoard = updateTile(board, from, { unit: null })
	newBoard = updateTile(newBoard, to, { unit })
	return {
		board: newBoard,
		unitStates: updateUnitPosition(unitStates, unitId, to)
	}
}

/**
 * Every unit on the board must have a matching UnitState whose `position`
 * equals its tile, and every UnitState must correspond to a unit on the
 * board. Throws on violation. Runs in O(board + unitStates) — cheap enough
 * for tests; keep it out of production hot paths.
 */
export function assertBoardUnitStatesConsistency(
	board: TileGrid,
	unitStates: UnitStateRecord
): void {
	const seenOnBoard = new Set<UnitId>()
	for (let r = 0; r < board.length; r++) {
		const row = board[r]
		if (!row) {
			continue
		}
		for (let q = 0; q < row.length; q++) {
			const tile = row[q]
			if (!tile?.unit) {
				continue
			}
			const unit = tile.unit
			if (seenOnBoard.has(unit.id)) {
				throw new BoardUnitInvariantError(
					`unit ${unit.id} appears on multiple tiles`
				)
			}
			seenOnBoard.add(unit.id)
			const state = unitStates[unit.id]
			if (!state) {
				throw new BoardUnitInvariantError(
					`unit ${unit.id} on tile (${q}, ${r}) has no UnitState`
				)
			}
			if (state.position.q_idx !== q || state.position.r_idx !== r) {
				throw new BoardUnitInvariantError(
					`unit ${unit.id} is on tile (${q}, ${r}) but UnitState.position is (${state.position.q_idx}, ${state.position.r_idx})`
				)
			}
		}
	}
	for (const unitId of typedKeys(unitStates)) {
		if (!seenOnBoard.has(unitId)) {
			throw new BoardUnitInvariantError(
				`UnitState exists for ${unitId} but unit is not on the board`
			)
		}
	}
}
