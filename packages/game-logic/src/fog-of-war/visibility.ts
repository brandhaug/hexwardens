import { type BoardPosition, positionKey } from '../board/position'
import { positionsWithin } from '../board/position-range'
import { getTribeVillageRangeFromEntries } from '../board/tribe-range'
import { hasTechPassive, type Tech } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { getEffectiveUnitStatsForTerrain, type Unit } from '../domains/unit'
import { type WorldUnit } from '../engine/world-contract'
import { type GameState } from '../game'
import { type ReadonlyData } from '../type-utils'
import { type FilteredGameState, type FilteredTileState } from './schema'

interface VisibilityEntry {
	readonly at: BoardPosition
	readonly tile: ReadonlyData<FilteredTileState>
}

export type VisibilityTiles = ReadonlyMap<string, VisibilityEntry>

/** Current sight only. Reads known viewer data without reprojecting or importing authority. */
export function visibleTileIdsFor(
	state: GameState | FilteredGameState,
	tribe: Tribe
): ReadonlySet<string> {
	const tiles = new Map<string, VisibilityEntry>()
	const units: WorldUnit[] = []
	for (const [r_idx, row] of state.units.board.entries()) {
		for (const [q_idx, tile] of row.entries()) {
			if (!tile) {
				continue
			}
			const at = { q_idx, r_idx }
			tiles.set(positionKey(at), { at, tile })
			if (tile.unit?.tribe === tribe) {
				const unitState = state.units.unitStates[tile.unit.id]
				if (unitState) {
					units.push({ unit: tile.unit, state: unitState })
				}
			}
		}
	}
	return visibleTileIdsFromEntries(
		tiles,
		units,
		tribe,
		state.playerStates[tribe]?.researchedTechs ?? []
	)
}

/** The same sight rules serve ECS projection and the read-only viewer query. */
export function visibleTileIdsFromEntries(
	tiles: VisibilityTiles,
	units: Iterable<WorldUnit>,
	tribe: Tribe,
	researchedTechs: readonly Tech[]
): Set<string> {
	const entries = [...tiles.values()]
	const visible = getTribeVillageRangeFromEntries(entries, tribe)
	const positions = entries.map(({ at }) => at)
	for (const { unit, state } of units) {
		if (unit.tribe !== tribe) {
			continue
		}
		const tile = tiles.get(positionKey(state.position))?.tile
		if (!tile || tile.terrain === null) {
			continue
		}
		const range = effectiveSightRange(unit, researchedTechs, tile)
		visible.add(positionKey(state.position))
		for (const at of positionsWithin(positions, state.position, range)) {
			visible.add(positionKey(at))
		}
	}
	return visible
}

function effectiveSightRange(
	unit: Unit,
	researchedTechs: readonly Tech[],
	tile: {
		readonly terrain: NonNullable<FilteredTileState['terrain']>
		readonly isMountain: boolean
	}
): number {
	const stats = getEffectiveUnitStatsForTerrain(unit.type, tile.terrain)
	return (
		stats.explorationRange +
		(tile.isMountain ? 1 : 0) +
		(stats.range > 1 && hasTechPassive(researchedTechs, 'ranged_sight')
			? 1
			: 0) +
		(unit.stats.passive === 'flying' ? 1 : 0)
	)
}
