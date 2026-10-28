import { Result } from 'effect'
import {
	parseLobbySnapshot,
	snapshotToMatchConfig,
	type LobbySnapshot,
	type MatchInitOutcome,
	type MatchInitializer
} from '@hexwardens/game-logic/match/initializer'
import { type Env } from './types'

const TRANSIENT_RETRY_MS = 1000

/**
 * Production {@link MatchInitializer} adapter. Zod-validates the snapshot on
 * the way in, looks up the Match Durable Object by `idempotencyKey` so that
 * retries always hit the same DO, and maps the RPC response back to a
 * {@link MatchInitOutcome}. Network-ish errors become `transient` (safe to
 * retry); structured domain rejections become `permanent` (caller should
 * surface the reason to the host).
 */
export class DoMatchInitializer implements MatchInitializer {
	constructor(private readonly env: Env) {}

	async startMatch(
		snapshot: LobbySnapshot,
		idempotencyKey: string
	): Promise<MatchInitOutcome> {
		const parsed = parseLobbySnapshot(snapshot)
		if (Result.isFailure(parsed)) {
			return { status: 'invalid', issues: parsed.failure }
		}

		const config = snapshotToMatchConfig(parsed.success)
		const doId = this.env.MATCH.idFromName(idempotencyKey)
		const stub = this.env.MATCH.get(doId)

		try {
			const result = await stub.init(config, idempotencyKey)
			if (result.ok) {
				const status =
					result.status === 'already_initialized'
						? 'already-started'
						: 'started'
				return { status, matchId: result.matchId }
			}
			return { status: 'permanent', reason: result.error }
		} catch {
			return { status: 'transient', retryAfterMs: TRANSIENT_RETRY_MS }
		}
	}
}
