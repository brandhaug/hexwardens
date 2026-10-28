import { constVoid } from 'effect/Function'
import { useEffect, useRef, useState } from 'react'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	type BannerEvent,
	computeBannerEvents
} from '@/components/game/banner-events'
import {
	bannerDurationMs,
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'

/**
 * Observe `GameState` transitions and surface match-level banner events
 * ("Turn 12 — Your Move", capital captures) one at a time. Same contract
 * as `useMomentFeedback`: idempotent on identical state references, the
 * first non-null state is a silent baseline, and authoritative state is
 * never blocked on playback — banners that outlive their window are
 * simply dropped from the head of the queue on a timer.
 */
export function useTurnBanner(
	gameState: GameState,
	localTribe: Tribe
): BannerEvent | null {
	const [queue, setQueue] = useState<BannerEvent[]>([])
	const [reducedMotion, setReducedMotion] =
		useState<boolean>(prefersReducedMotion)
	const previousStateRef = useRef<GameState | null>(null)
	const transitionCountRef = useRef(0)

	useEffect(() => subscribeReducedMotion(setReducedMotion), [])

	useEffect(() => {
		const previous = previousStateRef.current
		previousStateRef.current = gameState
		if (previous === null) {
			return
		}
		if (previous === gameState) {
			return
		}

		transitionCountRef.current += 1
		const fresh = computeBannerEvents(
			previous,
			gameState,
			localTribe,
			`b-${transitionCountRef.current}`
		)
		if (fresh.length === 0) {
			return
		}
		// oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Committed turn events enqueue transient banners; this is an event queue rather than derived render state.
		setQueue((prev) => [...prev, ...fresh])
	}, [gameState, localTribe])

	const current = queue[0] ?? null

	useEffect(() => {
		if (!current) {
			return constVoid
		}
		const timer = setTimeout(() => {
			setQueue((prev) => prev.slice(1))
		}, bannerDurationMs(reducedMotion))
		return () => clearTimeout(timer)
	}, [current, reducedMotion])

	return current
}
