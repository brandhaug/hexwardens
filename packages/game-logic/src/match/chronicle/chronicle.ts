import {
	type Chronicle,
	type ChronicleEntry,
	type ChronicleEntryWithId,
	emptyChronicle
} from './chronicle-entry'

// `chronicle.ts` owns the accumulator helpers; the underlying entry types
// stay in `chronicle-entry.ts`. We re-export `Chronicle` and `emptyChronicle`
// for callers that already pull the helpers — both are tightly coupled to
// `appendChronicleEntries` / `truncateChronicle` below. Entry type imports
// continue to come from `chronicle-entry.ts` directly (no barrel files).
export type { Chronicle }
export { emptyChronicle }

/**
 * Append entries to a {@link Chronicle}, assigning each a strictly-monotonic
 * `seq`. Pure — never mutates the input. Returning the updated chronicle
 * (rather than just the new entries) makes the accumulator usable from
 * `useReducer` / `useSyncExternalStore` without an extra copy.
 */
export function appendChronicleEntries(
	chronicle: Chronicle,
	entries: readonly ChronicleEntry[]
): Chronicle {
	if (entries.length === 0) {
		return chronicle
	}
	const next: ChronicleEntryWithId[] = [...chronicle.entries]
	let seq = chronicle.nextSeq
	for (const entry of entries) {
		next.push({ ...entry, seq })
		seq++
	}
	return { entries: next, nextSeq: seq }
}

/**
 * Cap the chronicle to the last `limit` entries. Used by the UI panel to keep
 * the rolling history bounded — older entries fall off rather than being
 * persisted indefinitely. Stable: returns the same reference when the
 * chronicle is already within bounds.
 */
export function truncateChronicle(
	chronicle: Chronicle,
	limit: number
): Chronicle {
	if (chronicle.entries.length <= limit) {
		return chronicle
	}
	const drop = chronicle.entries.length - limit
	return {
		entries: chronicle.entries.slice(drop),
		nextSeq: chronicle.nextSeq
	}
}
