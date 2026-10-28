import { type Effect, Schedule } from 'effect'
import { query, type Database, type DatabaseError } from '@hexwardens/db/effect'
import { matchResults, playerMatchResults } from '@hexwardens/db/schema'
import { type MatchResult } from './types'

/**
 * Retry policy for transient D1 hiccups on match-result writes: exponential
 * backoff from 100ms, at most 3 retries. Only safe on idempotent writes —
 * `writeMatchResult` and daily-completion upserts qualify (`onConflictDoNothing`
 * / upsert semantics), so a retried partial success can't double-count.
 */
export const persistenceRetryPolicy = Schedule.exponential('100 millis').pipe(
	Schedule.upTo({ times: 3 })
)

export const writeMatchResult = (
	result: MatchResult
): Effect.Effect<void, DatabaseError, Database> =>
	query('writeMatchResult', async (db) => {
		const head = db
			.insert(matchResults)
			.values({
				matchId: result.matchId,
				winnerTribe: result.winner,
				players: result.players,
				duration: result.duration,
				turnCount: result.turnCount,
				mapSize: result.mapSize,
				completedAt: result.completedAt
			})
			.onConflictDoNothing()

		const tail = result.players.map((player) =>
			db
				.insert(playerMatchResults)
				.values({
					matchId: result.matchId,
					playerId: player.playerId,
					username: player.username,
					tribe: player.tribe,
					isWinner: result.winner === player.tribe,
					isBot: player.isBot,
					completedAt: result.completedAt
				})
				.onConflictDoNothing()
		)

		await db.batch([head, ...tail])
	})
