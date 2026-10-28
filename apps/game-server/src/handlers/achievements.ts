import { HexwardensApi } from '@hexwardens/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Achievements } from '../achievements'
import { capture } from '../observability'
import { requirePlayerProfile } from './player-profile'

export const AchievementsHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'achievements',
	(handlers) =>
		handlers.handle('get', ({ params }) =>
			capture(
				Effect.gen(function* () {
					const profile = yield* requirePlayerProfile(params.username)
					const achievements = yield* Achievements
					const unlocks = yield* achievements.getUnlocks(profile.user.playerId)
					return {
						username: profile.user.username,
						unlocks: unlocks.map((u) => ({
							achievementId: u.achievementId,
							unlockedAt: u.unlockedAt,
							matchId: u.matchId
						}))
					}
				})
			)
		)
)
