import { Effect, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { tribes } from '@hexwardens/game-logic/domains/tribe'
import { InternalError, PlayerNotFoundError } from './errors.ts'

// DTOs intentionally hand-rolled rather than derived via
// `drizzle-orm/effect-schema` — that package references `Buffer` at module
// top-level and would crash both the client bundle and the Worker on import.
// The `tribe` enum is the only column-bound field and lives in game-logic, so
// the table schema is no longer the single source of truth for these wire
// shapes (kept in sync manually).
const TribeSchema = Schema.Literals(tribes)

export const UserRef = Schema.Struct({
	playerId: Schema.String,
	username: Schema.String
})

export const StatsBlock = Schema.Struct({
	wins: Schema.Finite,
	losses: Schema.Finite,
	matches: Schema.Finite,
	winRate: Schema.Finite
})

export const TribeStatsBlock = Schema.Struct({
	tribe: TribeSchema,
	wins: Schema.Finite,
	losses: Schema.Finite,
	matches: Schema.Finite,
	winRate: Schema.Finite
})

export const PlayerProfile = Schema.Struct({
	user: UserRef,
	overallStats: StatsBlock,
	tribeStats: Schema.Array(TribeStatsBlock)
})

export const MatchHistoryEntry = Schema.Struct({
	matchId: Schema.String,
	tribe: TribeSchema,
	isWinner: Schema.Boolean,
	completedAt: Schema.String
})

export const ProfileResponse = Schema.Struct({
	profile: PlayerProfile,
	recentMatches: Schema.Array(MatchHistoryEntry)
})

const ProfileQuery = Schema.Struct({
	matchLimit: Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 })),
		Schema.withDecodingDefaultType(Effect.succeed(20))
	)
})

export type UserRef = typeof UserRef.Type
export type StatsBlock = typeof StatsBlock.Type
export type TribeStats = typeof TribeStatsBlock.Type
export type PlayerProfile = typeof PlayerProfile.Type
export type MatchHistoryEntry = typeof MatchHistoryEntry.Type
export type ProfileResponse = typeof ProfileResponse.Type

export const ProfileApi = HttpApiGroup.make('profile').add(
	HttpApiEndpoint.get('get', '/profile/:username', {
		params: Schema.Struct({ username: Schema.String }),
		query: ProfileQuery,
		success: ProfileResponse,
		error: [InternalError, PlayerNotFoundError]
	})
)
