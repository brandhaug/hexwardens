import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { achievementIds } from '@hexwardens/game-logic/achievements/registry'
import { InternalError, PlayerNotFoundError } from './errors.ts'

// See profile.ts for why these DTOs avoid `drizzle-orm/effect-schema`.
export const AchievementUnlock = Schema.Struct({
	achievementId: Schema.Literals(achievementIds),
	unlockedAt: Schema.String,
	matchId: Schema.NullOr(Schema.String)
})

export const AchievementsResponse = Schema.Struct({
	username: Schema.String,
	unlocks: Schema.Array(AchievementUnlock)
})

export type AchievementUnlock = typeof AchievementUnlock.Type
export type AchievementsResponse = typeof AchievementsResponse.Type

export const AchievementsApi = HttpApiGroup.make('achievements').add(
	HttpApiEndpoint.get('get', '/achievements/:username', {
		params: Schema.Struct({ username: Schema.String }),
		success: AchievementsResponse,
		error: [InternalError, PlayerNotFoundError]
	})
)
