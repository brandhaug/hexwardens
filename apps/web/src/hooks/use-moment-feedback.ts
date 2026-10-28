import { useEffect, useRef, useState } from 'react'
import { type GameState } from '@hexwardens/game-logic/game'
import { computeMoments } from '@/lib/moment-feedback/compute-moments'
import { type Moment } from '@/lib/moment-feedback/moment'
import {
	calloutDurationMs,
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'

export interface ActiveMoment {
	readonly moment: Moment
	readonly mountedAt: number
}

function scheduleMomentRemoval(
	ids: ReadonlySet<string>,
	duration: number,
	timers: Set<ReturnType<typeof setTimeout>>,
	removeMoments: (ids: ReadonlySet<string>) => void
) {
	const timer = setTimeout(() => {
		timers.delete(timer)
		removeMoments(ids)
	}, duration)
	timers.add(timer)
}

/**
 * Observe transitions between consecutive `GameState` snapshots and surface
 * the resulting presentational moments for a fixed window. The hook is
 * idempotent — passing the same `gameState` reference twice does not
 * re-emit moments — and it never blocks game state updates: moments are
 * mounted, then removed via `setTimeout` once their playback window has
 * elapsed.
 *
 * Authoritative state is never synchronised with animation completion.
 * If a turn produces moments that outlive the visual window, the renderer
 * simply drops them — the next state update arrives unblocked.
 */
export function useMomentFeedback(gameState: GameState): ActiveMoment[] {
	const [activeMoments, setActiveMoments] = useState<ActiveMoment[]>([])
	const [reducedMotion, setReducedMotion] =
		useState<boolean>(prefersReducedMotion)
	const previousStateRef = useRef<GameState | null>(null)
	const transitionCountRef = useRef(0)
	const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

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
		const transitionId = `t-${transitionCountRef.current}`
		const fresh = computeMoments(previous, gameState, transitionId)
		if (fresh.length === 0) {
			return
		}

		const now = Date.now()
		const next: ActiveMoment[] = fresh.map((moment) => ({
			moment,
			mountedAt: now
		}))
		setActiveMoments((prev) => [...prev, ...next])

		const ids = new Set(next.map((m) => m.moment.id))
		const duration = calloutDurationMs(reducedMotion)
		scheduleMomentRemoval(
			ids,
			duration,
			pendingTimersRef.current,
			(momentIds) => {
				setActiveMoments((prev) =>
					prev.filter((m) => !momentIds.has(m.moment.id))
				)
			}
		)
	}, [gameState, reducedMotion])

	useEffect(() => {
		const timers = pendingTimersRef.current
		return () => {
			for (const timer of timers) {
				clearTimeout(timer)
			}
			timers.clear()
		}
	}, [])

	return activeMoments
}
