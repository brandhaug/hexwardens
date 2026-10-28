import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Unit } from '@hexwardens/game-logic/domains/unit'
import { type TileState } from '@hexwardens/game-logic/tile/tile'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import { typedEntries } from '@hexwardens/game-logic/type-utils'
import { type UnitStateRecord } from '@hexwardens/game-logic/unit-state-utils'

export interface UnitTransition {
	readonly unitId: string
	readonly from: BoardPosition
	readonly to: BoardPosition
}

export interface UnitDefeatTransition {
	readonly unit: Unit
	readonly position: BoardPosition
	readonly terrain: TileTerrain
	readonly isMountain: boolean
}

export type UnitCombatOverrideState = 'attack' | 'defend'

export interface UnitCombatOverride {
	readonly unitId: string
	readonly state: UnitCombatOverrideState
}

function indexUnitPositions(
	board: readonly (readonly (TileState | null)[])[]
): Map<string, BoardPosition> {
	const positions = new Map<string, BoardPosition>()
	for (const [r_idx, row] of board.entries()) {
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			if (tile?.unit) {
				positions.set(tile.unit.id, { q_idx, r_idx })
			}
		}
	}
	return positions
}

export function unitTransitions(
	prevBoard: readonly (readonly (TileState | null)[])[] | null,
	nextBoard: readonly (readonly (TileState | null)[])[]
): readonly UnitTransition[] {
	if (!prevBoard) {
		return []
	}
	const prev = indexUnitPositions(prevBoard)
	const next = indexUnitPositions(nextBoard)
	const result: UnitTransition[] = []
	for (const [unitId, to] of next) {
		const from = prev.get(unitId)
		if (!from) {
			continue
		}
		if (from.q_idx === to.q_idx && from.r_idx === to.r_idx) {
			continue
		}
		result.push({ unitId, from, to })
	}
	return result
}

interface IndexedUnit {
	readonly unit: Unit
	readonly position: BoardPosition
	readonly terrain: TileTerrain
	readonly isMountain: boolean
}

function indexUnits(
	board: readonly (readonly (TileState | null)[])[]
): Map<string, IndexedUnit> {
	const units = new Map<string, IndexedUnit>()
	for (const [r_idx, row] of board.entries()) {
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			if (!tile?.unit) {
				continue
			}
			units.set(tile.unit.id, {
				unit: tile.unit,
				position: { q_idx, r_idx },
				terrain: tile.terrain,
				isMountain: tile.isMountain
			})
		}
	}
	return units
}

export function unitDefeatTransitions(
	prevBoard: readonly (readonly (TileState | null)[])[] | null,
	nextBoard: readonly (readonly (TileState | null)[])[]
): readonly UnitDefeatTransition[] {
	if (!prevBoard) {
		return []
	}
	const prev = indexUnits(prevBoard)
	const next = indexUnits(nextBoard)
	const result: UnitDefeatTransition[] = []
	for (const [unitId, entry] of prev) {
		if (next.has(unitId)) {
			continue
		}
		result.push({
			unit: entry.unit,
			position: entry.position,
			terrain: entry.terrain,
			isMountain: entry.isMountain
		})
	}
	return result
}

function hasCombatDamage(
	prevUnitStates: UnitStateRecord,
	nextUnitStates: UnitStateRecord
): boolean {
	for (const [unitId, prevState] of typedEntries(prevUnitStates)) {
		const nextState = nextUnitStates[unitId]
		if (!nextState) {
			return true
		}
		if (nextState.health < prevState.health) {
			return true
		}
	}
	return false
}

/**
 * Emit one combat override per unit that swung or took damage between two
 * UnitStateRecord snapshots. Attack wins over defend when both apply to the
 * same unit (counter-attackers): both share an override slot keyed by
 * unitId, and attack better telegraphs combat engagement.
 *
 * Returns empty if nothing took damage this tick — a unit that flipped
 * `ready` → `acted` without anyone losing health was performing a
 * non-combat action (collect, build, capture), not attacking.
 *
 * Coupled to `board-animations.ts`, which groups the emitted overrides by
 * `state` to apply per-state durations. If a future change widens
 * `UnitAnimationOverride` to a per-unit queue (e.g. visibly defend → swing
 * back for counter-attackers), the attack/defend precedence baked in here
 * and the by-state grouping there both need to change together.
 */
export function unitCombatOverrides(
	prevUnitStates: UnitStateRecord,
	nextUnitStates: UnitStateRecord
): readonly UnitCombatOverride[] {
	if (!hasCombatDamage(prevUnitStates, nextUnitStates)) {
		return []
	}
	const result: UnitCombatOverride[] = []
	for (const [unitId, nextState] of typedEntries(nextUnitStates)) {
		const prevState = prevUnitStates[unitId]
		if (!prevState) {
			continue
		}
		const spentByAttack =
			(prevState.mode === 'ready' || prevState.mode === 'moved') &&
			(nextState.mode === 'acted' || nextState.mode === 'retreat')
		const scoredKill = nextState.killsThisTurn > prevState.killsThisTurn
		if (spentByAttack || scoredKill) {
			result.push({ unitId, state: 'attack' })
			continue
		}
		if (nextState.health < prevState.health) {
			result.push({ unitId, state: 'defend' })
		}
	}
	return result
}
