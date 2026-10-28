import { HexwardensApi } from '@hexwardens/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Leaderboard } from '../leaderboard'
import { capture } from '../observability'

export const LeaderboardHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'leaderboard',
	(handlers) =>
		handlers.handle('list', ({ query }) =>
			capture(
				Effect.gen(function* () {
					const lb = yield* Leaderboard
					return yield* lb.getLeaderboard(query)
				})
			)
		)
)
