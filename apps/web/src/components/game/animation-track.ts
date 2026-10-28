import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Single canonical lifecycle for "scheduled-then-cleared" visual entries
 * keyed by id. A track stores active entries and clears each one after a
 * caller-supplied duration. An internal sequence guards against races: if
 * a fresh `schedule` overwrites an entry, the previous timer's cleanup is
 * a no-op. Used by `useBoardAnimations` for unit moves, attack
 * animations, and defeat animations — three flavors with the same
 * cancellation semantics.
 */

interface TrackedEntry<T> {
	readonly value: T
	readonly seq: number
}

export interface AnimationTrack<T> {
	readonly entries: ReadonlyMap<string, T>
	schedule: (
		items: ReadonlyArray<readonly [string, T]>,
		durationMs: number
	) => void
}

export function useAnimationTrack<T>(): AnimationTrack<T> {
	const [internal, setInternal] = useState<
		ReadonlyMap<string, TrackedEntry<T>>
	>(() => new Map())
	const seqRef = useRef(0)
	const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map()
	)

	useEffect(() => {
		const timers = timersRef.current
		return () => {
			for (const timer of timers.values()) {
				clearTimeout(timer)
			}
			timers.clear()
		}
	}, [])

	const schedule = useCallback(
		(items: ReadonlyArray<readonly [string, T]>, durationMs: number) => {
			if (items.length === 0) {
				return
			}
			const tracked: Array<readonly [string, TrackedEntry<T>]> = items.map(
				([id, value]) => [id, { value, seq: ++seqRef.current }] as const
			)
			setInternal((prev) => {
				const next = new Map(prev)
				for (const [id, entry] of tracked) {
					next.set(id, entry)
				}
				return next
			})
			for (const [id, entry] of tracked) {
				const existing = timersRef.current.get(id)
				if (existing) {
					clearTimeout(existing)
				}
				const timer = setTimeout(() => {
					timersRef.current.delete(id)
					setInternal((prev) => {
						const current = prev.get(id)
						if (!current || current.seq !== entry.seq) {
							return prev
						}
						const next = new Map(prev)
						next.delete(id)
						return next
					})
				}, durationMs)
				timersRef.current.set(id, timer)
			}
		},
		[]
	)

	const entries = useMemo<ReadonlyMap<string, T>>(() => {
		const map = new Map<string, T>()
		for (const [id, tracked] of internal) {
			map.set(id, tracked.value)
		}
		return map
	}, [internal])

	return useMemo(() => ({ entries, schedule }), [entries, schedule])
}
