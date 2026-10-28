import { type BoardPosition } from '../board/board'
import {
	BoardUnitInvariantError,
	moveUnit as placementMoveUnit,
	placeUnit,
	removeUnit as placementRemoveUnit
} from '../board/unit-placement'
import { type Tribe } from '../domains/tribe'
import {
	type Unit,
	type UnitDebuff,
	type UnitId,
	type UnitMode,
	type UnitState
} from '../domains/unit'
import { type UnitRegistry } from '../game'
import { type TileState } from '../tile/tile'
import { type ReadonlyData, typedEntries } from '../type-utils'
import { freshUnitState } from './world-units'
import {
	addUnitDebuff,
	incrementUnitKills,
	updateUnitHealth,
	updateUnitMode
} from '../unit-state-utils'

export type { UnitRegistry }

export type OccupiedTile = ReadonlyData<{
	position: BoardPosition
	tile: TileState
	unit: Unit
	state: UnitState
}>

export function tileAt(
	reg: ReadonlyData<UnitRegistry>,
	pos: BoardPosition
): ReadonlyData<TileState> | null {
	return reg.board[pos.r_idx]?.[pos.q_idx] ?? null
}

export function occupiedTileAt(
	reg: ReadonlyData<UnitRegistry>,
	pos: BoardPosition
): OccupiedTile | null {
	const tile = tileAt(reg, pos)
	const unit = tile?.unit
	if (!tile || !unit) {
		return null
	}
	const state = reg.unitStates[unit.id]
	if (!state) {
		throw new BoardUnitInvariantError(
			`occupiedTileAt: unit ${unit.id} on tile (${pos.q_idx}, ${pos.r_idx}) has no UnitState`
		)
	}
	return { position: pos, tile, unit, state }
}

export function occupiedTiles(
	reg: ReadonlyData<UnitRegistry>,
	tribe?: Tribe
): OccupiedTile[] {
	const occupied: OccupiedTile[] = []
	for (let r_idx = 0; r_idx < reg.board.length; r_idx++) {
		const row = reg.board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			const unit = tile?.unit
			if (!tile || !unit) {
				continue
			}
			if (tribe && unit.tribe !== tribe) {
				continue
			}
			const state = reg.unitStates[unit.id]
			if (!state) {
				throw new BoardUnitInvariantError(
					`occupiedTiles: unit ${unit.id} on tile (${q_idx}, ${r_idx}) has no UnitState`
				)
			}
			occupied.push({
				position: { r_idx, q_idx },
				tile,
				unit,
				state
			})
		}
	}
	return occupied
}

export function mapUnitStates(
	reg: UnitRegistry,
	update: (state: UnitState, id: UnitId) => UnitState
): UnitRegistry {
	let changed = false
	const unitStates: UnitRegistry['unitStates'] = {}
	for (const [unitId, state] of typedEntries(reg.unitStates)) {
		const next = update(state, unitId)
		unitStates[unitId] = next
		if (next !== state) {
			changed = true
		}
	}
	if (!changed) {
		return reg
	}
	return { board: reg.board, unitStates }
}

/** Low-level primitives for rare paths (tools, bot sim). */
export const unitsLow = {
	spawn(
		reg: UnitRegistry,
		pos: BoardPosition,
		unit: Unit,
		state: UnitState
	): UnitRegistry {
		return placeUnit(reg.board, reg.unitStates, pos, unit, state)
	},
	move(reg: UnitRegistry, unitId: UnitId, to: BoardPosition): UnitRegistry {
		return placementMoveUnit(reg.board, reg.unitStates, unitId, to)
	},
	remove(reg: UnitRegistry, unitId: UnitId): UnitRegistry {
		return placementRemoveUnit(reg.board, reg.unitStates, unitId)
	},
	setHealth(reg: UnitRegistry, unitId: UnitId, health: number): UnitRegistry {
		return {
			board: reg.board,
			unitStates: updateUnitHealth(reg.unitStates, unitId, health)
		}
	},
	setMode(reg: UnitRegistry, unitId: UnitId, mode: UnitMode): UnitRegistry {
		return {
			board: reg.board,
			unitStates: updateUnitMode(reg.unitStates, unitId, mode)
		}
	},
	addDebuff(
		reg: UnitRegistry,
		unitId: UnitId,
		debuff: UnitDebuff
	): UnitRegistry {
		return {
			board: reg.board,
			unitStates: addUnitDebuff(reg.unitStates, unitId, debuff)
		}
	},
	recordKill(reg: UnitRegistry, killerId: UnitId): UnitRegistry {
		return {
			board: reg.board,
			unitStates: incrementUnitKills(reg.unitStates, killerId)
		}
	}
} as const

/**
 * Spawn a freshly trained unit on `pos`. Owns the UnitState defaults so a new
 * field on UnitState can only be added in one place.
 */
export function trainUnit(
	reg: UnitRegistry,
	unit: Unit,
	pos: BoardPosition,
	opts?: { mode?: UnitMode; homeVillage?: BoardPosition }
): UnitRegistry {
	return unitsLow.spawn(reg, pos, unit, freshUnitState(unit, pos, opts))
}
