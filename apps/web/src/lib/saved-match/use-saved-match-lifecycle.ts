import { constVoid } from 'effect/Function'
import {
	useLayoutEffect,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react'
import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	type SavedMatchRecord,
	type SavedMatchRevision
} from '@hexwardens/game-logic/match/saved-match'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import {
	createSavedMatchLifecycle,
	type SavedMatchLifecycle,
	type SavedMatchLoadResult,
	type SavedMatchSession
} from './saved-match-lifecycle'
import { createBrowserSavedMatchStore } from './saved-match-store'
import {
	getRemoteSavedMatch,
	putRemoteSavedMatch
} from './saved-match.functions'

/**
 * Browser wiring for the {@link SavedMatchLifecycle}: IndexedDB-backed local
 * store + the `apps/web` server functions as the remote replica. Remote sync
 * only applies to logged-in Players — the server functions answer
 * `anonymous` for guests, which the lifecycle treats as "no remote".
 */
export function useBrowserSavedMatchLifecycle(): SavedMatchLifecycle {
	return useMemo(
		() =>
			createSavedMatchLifecycle({
				store: createBrowserSavedMatchStore(),
				remote: {
					read: async () => {
						const r = await getRemoteSavedMatch()
						return r.status === 'ok' ? r.record : null
					},
					write: (record) => putRemoteSavedMatch({ data: record })
				}
			}),
		[]
	)
}

export type SavedMatchGateStatus =
	| { readonly kind: 'loading' }
	/** Play: resume `record`, or start fresh when `record` is `null`. */
	| { readonly kind: 'ready'; readonly record: SavedMatchRevision | null }
	| Exclude<SavedMatchLoadResult, { kind: 'ready' }>

/**
 * Load gate for the `/game` route: runs {@link SavedMatchLifecycle.load} once
 * and exposes the result as render-able status. `skip: true` (the
 * `fresh=true` search param — "I just configured a new game on the menu")
 * bypasses the load entirely and reports ready-with-no-record.
 */
export function useSavedMatchGate(
	lifecycle: SavedMatchLifecycle,
	options: { readonly skip: boolean }
): SavedMatchGateStatus {
	const [status, setStatus] = useState<SavedMatchGateStatus>(() =>
		options.skip ? { kind: 'ready', record: null } : { kind: 'loading' }
	)

	useEffect(() => {
		if (status.kind !== 'loading') {
			return constVoid
		}
		let cancelled = false
		void lifecycle.load().then((result) => {
			if (cancelled) {
				return null
			}
			setStatus(result)
			return null
		})
		return () => {
			cancelled = true
		}
	}, [status.kind, lifecycle])

	return status
}

export interface UseSavedMatchSessionArgs {
	readonly lifecycle: SavedMatchLifecycle
	readonly savedMatchId: string
	readonly playerTribe: Tribe
	readonly difficulty: Difficulty
	readonly opponentCount: number
	readonly initial: SavedMatchRecord | null
	/** See {@link SavedMatchSession} — surfaced so the route can toast. */
	readonly onRemoteConflict?: (remote: SavedMatchRecord | null) => void
}

export interface SavedMatchSessionHandle {
	/** Persist the next Saved Match Revision from a committed `MatchState`. */
	recordCommittedState(matchState: MatchState): Promise<void>
	/** Tombstone the active Saved Match after game-over acknowledgement. */
	acknowledgeDeleted(): Promise<void>
}

/**
 * React binding for the lifecycle's write session. Owns the tab-close /
 * unmount flush of pending remote writes (`pagehide` — the browser may or may
 * not deliver the request; the debounced write remains the primary
 * durability path) and keeps the conflict handler in a ref so debounced
 * writes observe the latest callback without rebuilding the session.
 */
export function useSavedMatchSession(
	args: UseSavedMatchSessionArgs
): SavedMatchSessionHandle {
	const {
		lifecycle,
		savedMatchId,
		playerTribe,
		difficulty,
		opponentCount,
		initial,
		onRemoteConflict
	} = args

	const conflictHandlerRef = useRef(onRemoteConflict)
	useLayoutEffect(() => {
		conflictHandlerRef.current = onRemoteConflict
	}, [onRemoteConflict])

	// `useState` lazy-init (not `useMemo`) — the session holds a live debounce
	// timer and the latest-revision chain, which React is allowed to discard
	// from a memo cache. One session per mounted match.
	// oxlint-disable-next-line react/refs, react/hook-use-state -- This session persists for the mounted match; its callback reads the ref only on later remote events.
	const [session] = useState<SavedMatchSession>(() =>
		lifecycle.beginSession({
			initial,
			onRemoteConflict: (remote) => conflictHandlerRef.current?.(remote)
		})
	)

	useEffect(() => {
		const flush = () => session.flushPendingRemote()
		window.addEventListener('pagehide', flush)
		return () => {
			window.removeEventListener('pagehide', flush)
			flush()
		}
	}, [session])

	const recordCommittedState = useCallback(
		(matchState: MatchState) => {
			return session.recordCommittedState(matchState, {
				savedMatchId,
				playerTribe,
				difficulty,
				opponentCount
			})
		},
		[session, savedMatchId, playerTribe, difficulty, opponentCount]
	)

	const acknowledgeDeleted = useCallback(
		() => session.acknowledgeDeleted(),
		[session]
	)

	return useMemo(
		() => ({ recordCommittedState, acknowledgeDeleted }),
		[recordCommittedState, acknowledgeDeleted]
	)
}
