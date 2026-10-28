import { Result } from 'effect'
import {
	parseLobbySnapshot,
	type LobbySnapshot,
	type MatchInitOutcome,
	type MatchInitializer
} from './initializer'

export type MatchInitCall = {
	snapshot: LobbySnapshot
	idempotencyKey: string
}

export type InMemoryMatchInitializer = MatchInitializer & {
	readonly calls: readonly MatchInitCall[]
	/**
	 * Program the next outcome(s) for an idempotency key. Successive calls with
	 * the key consume the queue; if empty, the initializer falls back to
	 * behaviour below (default outcome or implicit `started`).
	 */
	programOutcomes(key: string, outcomes: MatchInitOutcome[]): void
	setDefaultOutcome(outcome: MatchInitOutcome): void
}

type Options = {
	/** Maps an idempotency key to the matchId returned on implicit `started`. */
	deriveMatchId?: (key: string) => string
}

/**
 * Programmable in-memory adapter for tests. Tracks every call verbatim so
 * boundary assertions can inspect argument shape. Models the production
 * guarantee that re-calling with the same key after a `started` outcome
 * returns `already-started` with the same matchId.
 */
export function createInMemoryMatchInitializer(
	opts: Options = {}
): InMemoryMatchInitializer {
	const deriveMatchId = opts.deriveMatchId ?? ((key) => key)
	const calls: MatchInitCall[] = []
	const programmed = new Map<string, MatchInitOutcome[]>()
	const started = new Map<string, string>()
	let defaultOutcome: MatchInitOutcome | null = null

	return {
		calls,
		programOutcomes(key, outcomes) {
			programmed.set(key, [...outcomes])
		},
		setDefaultOutcome(outcome) {
			defaultOutcome = outcome
		},
		startMatch(snapshot, idempotencyKey) {
			try {
				const parsed = parseLobbySnapshot(snapshot)
				if (Result.isFailure(parsed)) {
					calls.push({ snapshot, idempotencyKey })
					return Promise.resolve({ status: 'invalid', issues: parsed.failure })
				}
				calls.push({ snapshot: parsed.success, idempotencyKey })

				const queued = programmed.get(idempotencyKey)
				const programmedNext = queued?.shift()
				if (programmedNext) {
					if (
						programmedNext.status === 'started' ||
						programmedNext.status === 'already-started'
					) {
						started.set(idempotencyKey, programmedNext.matchId)
					}
					return Promise.resolve(programmedNext)
				}

				const existing = started.get(idempotencyKey)
				if (existing !== undefined) {
					return Promise.resolve({
						status: 'already-started',
						matchId: existing
					})
				}

				if (defaultOutcome) {
					if (
						defaultOutcome.status === 'started' ||
						defaultOutcome.status === 'already-started'
					) {
						started.set(idempotencyKey, defaultOutcome.matchId)
					}
					return Promise.resolve(defaultOutcome)
				}

				const matchId = deriveMatchId(idempotencyKey)
				started.set(idempotencyKey, matchId)
				return Promise.resolve({ status: 'started', matchId })
			} catch (cause) {
				return Promise.reject(cause)
			}
		}
	}
}
