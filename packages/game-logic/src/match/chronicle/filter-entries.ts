import { positionKey } from '../../board/position'
import { type Tribe } from '../../domains/tribe'
import { assertNever } from '../../type-utils'
import { type ChronicleEntry } from './chronicle-entry'

/**
 * Fog-of-war filter for chronicle entries. The viewer always sees:
 *
 * - Their own actions (`actorTribe === viewer`).
 * - Events that target their tribe (`targetTribe === viewer`).
 * - `turnAdvanced` and `gameOver` (always public).
 * - Events whose `position` is in `visibleTileIds` (positional events visible
 *   when the viewer can see the tile).
 *
 * Otherwise the entry is dropped — preserves the same Fog-of-War contract the
 * `FilteredGameState` boundary enforces for board state.
 *
 * Generic over the entry shape so callers passing `ChronicleEntryWithId[]`
 * (the accumulator output) get the same `seq`-bearing type back without an
 * intermediate cast. Adding `& object` is intentional so primitives can't
 * silently slip through the inference.
 */
export function filterEntriesForViewer<T extends ChronicleEntry>(
	entries: readonly T[],
	viewer: Tribe,
	visibleTileIds: ReadonlySet<string>
): readonly T[] {
	return entries.filter((entry) => isVisibleTo(entry, viewer, visibleTileIds))
}

function isVisibleTo(
	entry: ChronicleEntry,
	viewer: Tribe,
	visibleTileIds: ReadonlySet<string>
): boolean {
	switch (entry.kind) {
		case 'turnAdvanced':
		case 'gameOver': {
			return true
		}
		case 'researchProgress':
		case 'researchCompleted':
		case 'villageLevelUp': {
			// Tribe-internal events: only the actor sees them. Research and
			// level-ups happen inside a player's own villages and shouldn't leak
			// across fog.
			return entry.actorTribe === viewer
		}
		case 'villageCaptured': {
			if (entry.actorTribe === viewer) {
				return true
			}
			if (entry.targetTribe === viewer) {
				return true
			}
			return visibleTileIds.has(positionKey(entry.position))
		}
		case 'unitDefeated': {
			if (entry.actorTribe === viewer) {
				return true
			}
			if (entry.targetTribe === viewer) {
				return true
			}
			return visibleTileIds.has(positionKey(entry.position))
		}
		default: {
			return assertNever(entry)
		}
	}
}
