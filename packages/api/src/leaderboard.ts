import { Effect, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { tribes } from '@hexwardens/game-logic/domains/tribe'
import { InternalError } from './errors.ts'

export const SortSchema = Schema.Literals(['wins', 'winRate', 'matches'])
const TribeSchema = Schema.Literals(tribes)

export const LeaderboardQuery = Schema.Struct({
	sort: SortSchema.pipe(
		Schema.withDecodingDefaultType(Effect.succeed('wins' as const))
	),
	tribe: Schema.optional(TribeSchema),
	minMatches: Schema.optional(
		Schema.Finite.pipe(
			Schema.check(
				Schema.isInt(),
				Schema.isBetween({ minimum: 0, maximum: 1000 })
			)
		)
	),
	limit: Schema.Finite.pipe(
		Schema.check(
			Schema.isInt(),
			Schema.isBetween({ minimum: 1, maximum: 100 })
		),
		Schema.withDecodingDefaultType(Effect.succeed(50))
	),
	offset: Schema.Finite.pipe(
		Schema.check(
			Schema.isInt(),
			Schema.isBetween({ minimum: 0, maximum: 10_000 })
		),
		Schema.withDecodingDefaultType(Effect.succeed(0))
	)
})

export const LeaderboardEntry = Schema.Struct({
	playerId: Schema.String,
	username: Schema.String,
	wins: Schema.Finite,
	losses: Schema.Finite,
	matches: Schema.Finite,
	winRate: Schema.Finite
})

export const LeaderboardPage = Schema.Struct({
	entries: Schema.Array(LeaderboardEntry),
	total: Schema.Finite
})

export type LeaderboardSort = typeof SortSchema.Type
export type LeaderboardQuery = typeof LeaderboardQuery.Type
export type LeaderboardEntry = typeof LeaderboardEntry.Type
export type LeaderboardPage = typeof LeaderboardPage.Type

export const LeaderboardApi = HttpApiGroup.make('leaderboard').add(
	HttpApiEndpoint.get('list', '/leaderboard', {
		query: LeaderboardQuery,
		success: LeaderboardPage,
		error: InternalError
	})
)
