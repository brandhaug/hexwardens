import { HexwardensApi } from '@hexwardens/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Leaderboard } from '../leaderboard'
import { capture } from '../observability'
import { requirePlayerProfile } from './player-profile'

export const ProfileHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'profile',
	(handlers) =>
		handlers.handle('get', ({ params, query }) =>
			capture(
				Effect.gen(function* () {
					const lb = yield* Leaderboard
					const profile = yield* requirePlayerProfile(params.username)
					const recentMatches = yield* lb.getMatchHistory(
						profile.user.playerId,
						{
							limit: query.matchLimit,
							offset: 0
						}
					)
					return { profile, recentMatches }
				})
			)
		)
)
