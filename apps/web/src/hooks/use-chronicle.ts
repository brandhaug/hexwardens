import { useCallback, useMemo, useReducer } from 'react'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { visibleTileIdsFor } from '@hexwardens/game-logic/fog-of-war/visibility'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	appendChronicleEntries,
	emptyChronicle,
	truncateChronicle,
	type Chronicle
} from '@hexwardens/game-logic/match/chronicle/chronicle'
import { type ChronicleEntry } from '@hexwardens/game-logic/match/chronicle/chronicle-entry'
import { filterEntriesForViewer } from '@hexwardens/game-logic/match/chronicle/filter-entries'
import { assertNever } from '@hexwardens/game-logic/type-utils'

const ONLINE_CHRONICLE_LIMIT = 200

type AppendAction = { type: 'append'; entries: readonly ChronicleEntry[] }
type ResetAction = { type: 'reset' }
type ChronicleAction = AppendAction | ResetAction

function chronicleReducer(
	chronicle: Chronicle,
	action: ChronicleAction
): Chronicle {
	switch (action.type) {
		case 'reset': {
			return emptyChronicle
		}
		case 'append': {
			if (action.entries.length === 0) {
				return chronicle
			}
			return truncateChronicle(
				appendChronicleEntries(chronicle, action.entries),
				ONLINE_CHRONICLE_LIMIT
			)
		}
		default: {
			return assertNever(action)
		}
	}
}

/**
 * React hook for accumulating a {@link Chronicle} from a stream of entries.
 * Used by the multiplayer route to fold `turnEvents` server messages into a
 * rolling chronicle. Returns a stable `append` callback so consumers can call
 * it inside `useEffect` without retriggering subscriptions.
 */
export function useChronicleAccumulator() {
	const [chronicle, dispatchAction] = useReducer(
		chronicleReducer,
		emptyChronicle
	)

	const append = useCallback((entries: readonly ChronicleEntry[]) => {
		dispatchAction({ type: 'append', entries })
	}, [])

	const reset = useCallback(() => {
		dispatchAction({ type: 'reset' })
	}, [])

	return { chronicle, append, reset }
}

/**
 * Project an accumulated chronicle to its fog-filtered view for the local
 * viewer.
 */
export function useFilteredChronicleEntries(
	chronicle: Chronicle,
	viewer: Tribe | null,
	state: GameState | null
): readonly ChronicleEntry[] {
	const visibleTileIds = useMemo(
		() => (viewer && state ? visibleTileIdsFor(state, viewer) : null),
		[state, viewer]
	)

	return useMemo(() => {
		if (!viewer || !visibleTileIds) {
			return chronicle.entries
		}
		return filterEntriesForViewer(chronicle.entries, viewer, visibleTileIds)
	}, [chronicle.entries, viewer, visibleTileIds])
}
