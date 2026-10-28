import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { Effect, Schema } from 'effect'
import { mintGameToken } from '@/lib/auth.server'
import { runWithServerContext } from '@/lib/server-context'
import { checkServerRateLimit } from '@/lib/server-rate-limit'

class GameTokenMintError extends Schema.TaggedError<GameTokenMintError>()(
	'GameTokenMintError',
	{
		message: Schema.String
	},
	{ httpApiStatus: 500 }
) {}

class GameTokenRateLimitError extends Schema.TaggedError<GameTokenRateLimitError>()(
	'GameTokenRateLimitError',
	{
		message: Schema.String,
		retryAfterSeconds: Schema.Finite
	},
	{ httpApiStatus: 429 }
) {}

const mintGameTokenEffect = Effect.fn('GameToken.mint')(function* () {
	return yield* mintGameToken().pipe(
		Effect.mapError(
			() => new GameTokenMintError({ message: 'Unable to create game token' })
		)
	)
})

export const getGameToken = createServerFn({ method: 'GET' }).handler(() => {
	const request = getRequest()
	const rateLimit = checkServerRateLimit(request, 'game_token', {
		windowMs: 60_000,
		maxRequests: 30
	})
	return runWithServerContext(
		request,
		Effect.gen(function* () {
			if (rateLimit.kind === 'limited') {
				return yield* new GameTokenRateLimitError({
					message: 'Too many token requests',
					retryAfterSeconds: rateLimit.retryAfterSeconds
				})
			}
			const token = yield* mintGameTokenEffect()
			return { token, serverUrl: env.GAME_SERVER_URL }
		})
	)
})
