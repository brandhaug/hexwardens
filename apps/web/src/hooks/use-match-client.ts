import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { type GameState } from '@hexwardens/game-logic/game'
import { type BroadcastEvent } from '@hexwardens/game-logic/multiplayer/types'
import { type MatchClient } from '@/lib/match-client'

/**
 * React bindings for the {@link MatchClient} seam — the small set of
 * subscriptions both the offline `/game` route and the online
 * `/multiplayer-game` route used to wire by hand.
 */

/**
 * Current effective game state from the client. `null` only before the
 * first multiplayer server projection lands; offline adapters never return
 * `null`. Tear-free via `useSyncExternalStore` — adapters guarantee
 * referentially-stable snapshots between change notifications.
 */
export function useMatchClientGameState(client: MatchClient): GameState | null {
	const subscribe = useCallback(
		(listener: () => void) => client.subscribe(listener),
		[client]
	)
	const getSnapshot = useCallback(() => client.getGameState(), [client])
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Whether the local Player may act right now, kept in sync with the client. */
export function useMatchClientCanAct(client: MatchClient): boolean {
	const subscribe = useCallback(
		(listener: () => void) => client.subscribe(listener),
		[client]
	)
	const getSnapshot = useCallback(() => client.canAct(), [client])
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Latest `turnEvents` broadcast payload from the Match, as a React value.
 * Feeds `useGameAudio` (and any animation/projection consumer keyed on
 * broadcast-event identity). `null` until the first payload arrives.
 */
export function useMatchBroadcastEvents(
	client: MatchClient
): readonly BroadcastEvent[] | null {
	const [events, setEvents] = useState<readonly BroadcastEvent[] | null>(null)
	useEffect(() => {
		const unsubscribe = client.subscribeBroadcastEvents((next) => {
			setEvents(next)
		})
		return () => {
			unsubscribe()
		}
	}, [client])
	return events
}
