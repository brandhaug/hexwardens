import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { type OccupiedTile, occupiedTiles } from '../units/registry'
import { canUnitAttack, canUnitMove } from '../validation/unit'

/**
 * A unit on the board that still has an action available this turn — either
 * it can move (mode `ready` / `retreat`) or it can still attack after moving
 * (mode `moved` for units with `canAttackAfterMove`).
 */
export type ActionableUnit = Pick<OccupiedTile, 'unit' | 'state' | 'position'>

/**
 * Return every own-tribe unit that has remaining orders this turn, sorted by
 * unit id ascending so cycling order is deterministic and stable across
 * frames. Used by the "next unit" cycler in the UI.
 *
 * A unit is considered actionable when it can still move OR still attack —
 * that mirrors the validation gates in {@link canUnitMove} / {@link canUnitAttack}
 * so the cycler never points at a unit the engine would refuse to act with.
 */
export function selectActionableUnits(
	state: GameState,
	tribe: Tribe
): ActionableUnit[] {
	const actionable: ActionableUnit[] = []
	for (const occupied of occupiedTiles(state.units, tribe)) {
		if (
			canUnitMove(occupied.state) ||
			canUnitAttack(occupied.state, occupied.unit)
		) {
			actionable.push({
				unit: occupied.unit,
				state: occupied.state,
				position: occupied.position
			})
		}
	}
	return actionable.toSorted((a, b) =>
		compareUnitIdsNumerically(a.unit.id, b.unit.id)
	)
}

/**
 * Sort `unit_2` before `unit_10` rather than lexicographically. Unit ids are
 * minted as `unit_${counter}` (see `generateNextUnitId`), and tests/scenarios
 * also use the same `unit_<digits>` shape — using numeric ordering keeps the
 * cycle order monotonic with spawn order.
 */
function compareUnitIdsNumerically(a: string, b: string): number {
	const aNum = extractTrailingNumber(a)
	const bNum = extractTrailingNumber(b)
	if (aNum !== null && bNum !== null && aNum !== bNum) {
		return aNum - bNum
	}
	if (a < b) {
		return -1
	}
	return a > b ? 1 : 0
}

function extractTrailingNumber(id: string): number | null {
	const match = /(\d+)$/.exec(id)
	if (!match) {
		return null
	}
	const parsed = Number(match[1])
	return Number.isFinite(parsed) ? parsed : null
}
