/**
 * Pacing port for `runBotTurn`. The loop awaits `pacer.next(signal)` between
 * actions; the pacer decides whether to resolve immediately, wait on a timer,
 * or defer to an external clock. Rejecting aborts the turn.
 */
export interface BotPacer {
	/** Resolves when the next action may run. Reject to cancel the turn. */
	next(signal: AbortSignal): Promise<void>
}

/** Fires the next action as soon as the microtask queue drains. */
export const immediatePacer: BotPacer = {
	next: () => Promise.resolve()
}

/**
 * Wall-clock pacer used by the UI to animate bot turns. The first call waits
 * `startMs`; subsequent calls wait `actionMs`. Honours the provided
 * `AbortSignal`: aborting before the timer fires clears the timeout and
 * rejects with `signal.reason`.
 *
 * Stateful: the returned pacer closes over a `first` flag that flips on its
 * first `next()` call. Each turn / `runBotTurn` invocation should construct
 * its own pacer — sharing one across turns collapses the `startMs` wait to
 * `actionMs` for every turn after the first.
 */
export function delayPacer(startMs: number, actionMs: number): BotPacer {
	let first = true
	return {
		next: (signal) =>
			new Promise((resolve, reject) => {
				if (signal.aborted) {
					reject(signal.reason)
					return
				}
				const ms = first ? startMs : actionMs
				first = false
				const id = setTimeout(() => {
					signal.removeEventListener('abort', onAbort)
					resolve()
				}, ms)
				const onAbort = () => {
					clearTimeout(id)
					reject(signal.reason)
				}
				signal.addEventListener('abort', onAbort, { once: true })
			})
	}
}
