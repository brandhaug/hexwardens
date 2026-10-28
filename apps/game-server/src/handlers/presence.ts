import { HexwardensApi } from '@hexwardens/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { PresenceCounter } from '../presence-service'

export const PresenceHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'presence',
	(handlers) =>
		handlers.handle('count', () =>
			Effect.gen(function* () {
				const presence = yield* PresenceCounter
				const online = yield* presence.count
				return { online }
			})
		)
)
