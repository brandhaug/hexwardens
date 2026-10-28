import { PlayerNotFoundError } from '@hexwardens/api'
import { Effect, Option } from 'effect'
import { Username } from '@hexwardens/game-logic/ids'
import { Leaderboard } from '../leaderboard'

export const requirePlayerProfile = (username: string) =>
	Effect.gen(function* () {
		const lb = yield* Leaderboard
		const profile = yield* lb.getPlayerProfile(Username.make(username))
		if (Option.isNone(profile)) {
			return yield* new PlayerNotFoundError({ username })
		}
		return profile.value
	})
