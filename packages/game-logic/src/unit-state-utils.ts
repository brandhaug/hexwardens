import { type Tribe } from './domains/tribe'
import { type BoardPosition } from './board/position'
import { type TileGrid } from './tile/tile'
import {
	type UnitDebuff,
	type UnitId,
	type UnitMode,
	type UnitState
} from './domains/unit'
import {
	omitKey,
	typedEntries,
	typedFromEntries,
	type ReadonlyData
} from './type-utils'

export type UnitStateRecord = Record<UnitId, UnitState>

class UnitStateInvariantError extends Error {
	constructor(operation: string, unitId: UnitId) {
		super(`${operation}: no UnitState for ${unitId}`)
		this.name = 'UnitStateInvariantError'
	}
}

function requireUnitState(
	unitStates: UnitStateRecord,
	unitId: UnitId,
	operation: string
): UnitState {
	const state = unitStates[unitId]
	if (!state) {
		throw new UnitStateInvariantError(operation, unitId)
	}
	return state
}

export function addUnitState(
	unitStates: UnitStateRecord,
	unitId: UnitId,
	state: UnitState
): UnitStateRecord {
	return { ...unitStates, [unitId]: state }
}

export function removeUnitState(
	unitStates: UnitStateRecord,
	unitId: UnitId
): UnitStateRecord {
	return omitKey(unitStates, unitId)
}

export function updateUnitHealth(
	unitStates: UnitStateRecord,
	unitId: UnitId,
	health: number
): UnitStateRecord {
	const state = requireUnitState(unitStates, unitId, 'updateUnitHealth')
	return { ...unitStates, [unitId]: { ...state, health } }
}

export function updateUnitMode(
	unitStates: UnitStateRecord,
	unitId: UnitId,
	mode: UnitMode
): UnitStateRecord {
	const state = requireUnitState(unitStates, unitId, 'updateUnitMode')
	return { ...unitStates, [unitId]: { ...state, mode } }
}

export function updateUnitPosition(
	unitStates: UnitStateRecord,
	unitId: UnitId,
	position: BoardPosition
): UnitStateRecord {
	const state = requireUnitState(unitStates, unitId, 'updateUnitPosition')
	return { ...unitStates, [unitId]: { ...state, position } }
}

/**
 * Reset all unit modes to 'ready'
 */
export function resetAllUnitModes(
	unitStates: UnitStateRecord
): UnitStateRecord {
	return typedFromEntries(
		typedEntries(unitStates).map(([id, state]): [UnitId, UnitState] => [
			id,
			{ ...state, mode: 'ready' }
		])
	)
}

/**
 * Reset per-turn fields: killsThisTurn and hasBeenAttackedThisTurn
 */
export function resetPerTurnFields(
	unitStates: UnitStateRecord
): UnitStateRecord {
	return typedFromEntries(
		typedEntries(unitStates).map(([id, state]): [UnitId, UnitState] => [
			id,
			{ ...state, killsThisTurn: 0, hasBeenAttackedThisTurn: false }
		])
	)
}

/**
 * Increment a unit's kill count with veterancy bonuses. Heroes do not level
 * from kills (per ADR-0001), so this applies uniformly to every unit type.
 */
export function incrementUnitKills(
	unitStates: UnitStateRecord,
	unitId: UnitId
): UnitStateRecord {
	const state = requireUnitState(unitStates, unitId, 'incrementUnitKills')
	return { ...unitStates, [unitId]: { ...state, ...killProgress(state) } }
}

/** Shared veterancy rule for normalized gameplay and immutable registry adapters. */
export function killProgress(state: ReadonlyData<UnitState>) {
	const newKills = state.kills + 1
	const newKillsThisTurn = state.killsThisTurn + 1

	// Veterancy: every 2 kills, alternate +1 ATK or +2 HP
	let veterancyBonusAtk = state.veterancyBonusAtk
	let veterancyBonusHp = state.veterancyBonusHp
	if (newKills % 2 === 0) {
		const veterancyTier = newKills / 2
		if (veterancyTier % 2 === 1) {
			veterancyBonusAtk += 1
		} else {
			veterancyBonusHp += 2
		}
	}

	return {
		kills: newKills,
		killsThisTurn: newKillsThisTurn,
		veterancyBonusAtk,
		veterancyBonusHp
	}
}

/**
 * Mark a unit as having been attacked this turn (for Skeleton Golem dodge)
 */
export function markAsAttackedThisTurn(
	unitStates: UnitStateRecord,
	unitId: UnitId
): UnitStateRecord {
	const state = requireUnitState(unitStates, unitId, 'markAsAttackedThisTurn')
	return {
		...unitStates,
		[unitId]: { ...state, hasBeenAttackedThisTurn: true }
	}
}

/**
 * Apply morale debuff to all units of a tribe when their hero dies
 */
export function applyMoraleDebuffToTribe(
	unitStates: UnitStateRecord,
	board: TileGrid,
	tribe: Tribe
): UnitStateRecord {
	let result = unitStates
	for (const row of board) {
		for (const tile of row) {
			if (tile?.unit?.tribe === tribe && result[tile.unit.id]) {
				result = addUnitDebuff(result, tile.unit.id, {
					type: 'morale_loss',
					atkReduction: 1,
					turnsRemaining: 2
				})
			}
		}
	}
	return result
}

/**
 * Add a debuff to a unit
 */
export function addUnitDebuff(
	unitStates: UnitStateRecord,
	unitId: UnitId,
	debuff: UnitDebuff
): UnitStateRecord {
	const state = requireUnitState(unitStates, unitId, 'addUnitDebuff')
	return {
		...unitStates,
		[unitId]: { ...state, debuffs: [...state.debuffs, debuff] }
	}
}

/**
 * Tick debuffs: decrement turnsRemaining and remove expired debuffs
 */
export function tickDebuffs(unitStates: UnitStateRecord): UnitStateRecord {
	return typedFromEntries(
		typedEntries(unitStates).map(([id, state]): [UnitId, UnitState] => [
			id,
			{
				...state,
				debuffs: state.debuffs.flatMap((d) =>
					d.turnsRemaining > 1
						? [{ ...d, turnsRemaining: d.turnsRemaining - 1 }]
						: []
				)
			}
		])
	)
}
