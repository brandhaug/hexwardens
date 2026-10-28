import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { dailyChallengeIds } from '@hexwardens/game-logic/daily-challenge/registry'
import { SessionAuth, Unauthorized } from './auth.ts'
import { InternalError } from './errors.ts'

const DailyDateSchema = Schema.String.pipe(
	Schema.refine((value): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value), {
		title: 'DailyDate'
	})
)

const DailyChallengeIdSchema = Schema.Literals(dailyChallengeIds)

// See profile.ts for why these DTOs avoid `drizzle-orm/effect-schema`.
export const DailyChallengeMeta = Schema.Struct({
	challengeId: DailyChallengeIdSchema,
	name: Schema.String,
	description: Schema.String,
	target: Schema.Finite
})

export const DailyLeaderboardEntry = Schema.Struct({
	userId: Schema.String,
	username: Schema.String,
	bestTurns: Schema.Finite,
	firstCompletedAt: Schema.String
})

export const DailyBest = Schema.Struct({
	userId: Schema.String,
	username: Schema.String,
	bestTurns: Schema.Finite,
	completionCount: Schema.Finite,
	firstCompletedAt: Schema.String,
	lastCompletedAt: Schema.String
})

export const DailyChallengeView = Schema.Struct({
	date: Schema.String,
	challenge: DailyChallengeMeta,
	entries: Schema.Array(DailyLeaderboardEntry),
	callerBest: Schema.NullOr(DailyBest),
	callerRank: Schema.NullOr(Schema.Finite),
	completionCount: Schema.Finite,
	isAuthenticated: Schema.Boolean
})

export type DailyChallengeView = typeof DailyChallengeView.Type
export type DailyChallengeMeta = typeof DailyChallengeMeta.Type
export type DailyLeaderboardEntry = typeof DailyLeaderboardEntry.Type
export type DailyBest = typeof DailyBest.Type
export type DailyChallengeCoreView = Omit<DailyChallengeView, 'isAuthenticated'>

const DateParams = Schema.Struct({ date: DailyDateSchema })

const DailyParamsOptionalDate = Schema.Struct({
	date: Schema.optional(DailyDateSchema)
})

const StreakResponse = Schema.Struct({ streak: Schema.Finite })

export const DailyApi = HttpApiGroup.make('daily')
	.add(
		HttpApiEndpoint.get('view', '/daily/:date', {
			params: DateParams,
			success: DailyChallengeView,
			error: InternalError
		}).middleware(SessionAuth)
	)
	.add(
		HttpApiEndpoint.get('streak', '/daily/streak', {
			query: DailyParamsOptionalDate,
			success: StreakResponse,
			error: [InternalError, Unauthorized]
		}).middleware(SessionAuth)
	)
