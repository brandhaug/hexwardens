import { HexwardensApi, PlayerNotFoundError } from '@hexwardens/api'
import { Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Username } from '@hexwardens/game-logic/ids'
import { Cosmetics } from '../cosmetics'
import { capture } from '../observability'

export const CosmeticsHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'cosmetics',
	(handlers) =>
		handlers.handle('get', ({ params }) =>
			capture(
				Effect.gen(function* () {
					const cosmetics = yield* Cosmetics
					const opt = yield* cosmetics.getPlayerCosmetics(
						Username.make(params.username)
					)
					if (Option.isNone(opt)) {
						return yield* new PlayerNotFoundError({ username: params.username })
					}
					return opt.value
				})
			)
		)
)
