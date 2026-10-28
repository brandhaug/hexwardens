import { constVoid } from 'effect/Function'
import { useEffect, useState } from 'react'

export interface TurnTimerSnapshot {
	secondsRemaining: number
	totalSeconds: number
}

export function useTurnTimer(
	turnEndsAt: number | null,
	totalMs: number | null,
	tickMs = 500
): TurnTimerSnapshot | null {
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (turnEndsAt === null || totalMs === null) {
			return constVoid
		}
		const id = setInterval(() => setNow(Date.now()), tickMs)
		return () => clearInterval(id)
	}, [turnEndsAt, totalMs, tickMs])

	if (turnEndsAt === null || totalMs === null || totalMs <= 0) {
		return null
	}

	const secondsRemaining = Math.max(0, (turnEndsAt - now) / 1000)
	const totalSeconds = totalMs / 1000
	return { secondsRemaining, totalSeconds }
}
