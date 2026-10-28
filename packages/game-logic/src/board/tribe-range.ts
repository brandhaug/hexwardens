import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { type TileState } from '../tile/tile'
import { type ReadonlyData } from '../type-utils'
import { Board } from './board'
import { type BoardPosition, positionKey } from './position'
import { positionsWithin } from './position-range'

/**
 * Tribe territory ("Village range"): the set of position keys
 * (`q_idx,r_idx`) within range of any of a tribe's villages.
 *
 * **Single owner of the territory meaning.** Every consumer — the Action
 * engine (`actions/engine.ts` context derivation), fog-of-war visibility
 * (`fog-of-war/snapshot.ts`), the `territory_regen` turn phase
 * (`turns/index.ts`), bot scoring (`bot/scoring-fixture.ts`), and the web
 * renderer — derives territory through this function. Don't re-derive the
 * village-range walk elsewhere.
 *
 * Derive once per operation and pass the set down; do NOT cache the result
 * across state mutations — the set is only valid for the board it was
 * computed from.
 *
 * Lives in `board/` rather than `domains/tribe` so `tribe.ts` does not need
 * to import the `Board` class — that back-edge is what closed the historic
 * cycle through `domains/unit` and `unitStateUtils`.
 */
export function getTribeVillageRange(
	tiles: GameState['units']['board'],
	tribe: Tribe
): Set<string> {
	const board = Board.from(tiles)
	return getTribeVillageRangeFromEntries(
		Array.from(board.entries(), ([at, tile]) => ({ at, tile })),
		tribe
	)
}

export interface VillageRangeEntry {
	readonly at: BoardPosition
	readonly tile: ReadonlyData<Pick<TileState, 'item'>>
}

/** Shared territory rule for authoritative ECS batches and known viewer tiles. */
export function getTribeVillageRangeFromEntries(
	entries: readonly VillageRangeEntry[],
	tribe: Tribe
): Set<string> {
	const rangePositions = new Set<string>()
	const positions = entries.map(({ at }) => at)
	for (const { at, tile } of entries) {
		if (tile.item?.type !== 'village' || tile.item.tribe !== tribe) {
			continue
		}
		rangePositions.add(positionKey(at))
		for (const position of positionsWithin(positions, at, tile.item.range)) {
			rangePositions.add(positionKey(position))
		}
	}
	return rangePositions
}
