import { Effect, Predicate, Schema } from 'effect'
import { HexwardensApi } from '@hexwardens/api'
import {
	FetchHttpClient,
	HttpClient,
	HttpClientError,
	HttpClientRequest
} from 'effect/http'
import * as AtomHttpApi from 'effect/reactivity/AtomHttpApi'
import { getStoredGameCredentials } from '@/lib/game-client'

class ApiConfigurationError extends Schema.TaggedError<ApiConfigurationError>()(
	'ApiConfigurationError',
	{ message: Schema.String }
) {}

const baseUrl = Effect.fn('Api.baseUrl')(function* () {
	const stored = getStoredGameCredentials()
	if (stored) {
		return stored.serverUrl
	}
	if (typeof window === 'undefined') {
		return ''
	}
	const fromVite = import.meta.env.VITE_GAME_SERVER_URL
	if (Predicate.isString(fromVite) && fromVite.length > 0) {
		return fromVite
	}
	// The localhost fallback is dev-only. A production bundle built without
	// VITE_GAME_SERVER_URL must fail loudly here, not silently call localhost.
	if (import.meta.env.DEV) {
		return 'http://localhost:8787'
	}
	return yield* new ApiConfigurationError({
		message: 'VITE_GAME_SERVER_URL is not configured in this build'
	})
})

const attachBearer = HttpClient.mapRequestEffect(
	Effect.fn(function* (request) {
		const stored = getStoredGameCredentials()
		const withBase = HttpClientRequest.prependUrl(
			request,
			yield* baseUrl().pipe(
				Effect.mapError(
					() =>
						new HttpClientError.HttpClientError({
							reason: new HttpClientError.InvalidUrlError({
								request,
								description:
									'VITE_GAME_SERVER_URL is not configured in this build'
							})
						})
				)
			)
		)
		return stored
			? HttpClientRequest.bearerToken(withBase, stored.token)
			: withBase
	})
)

export class HexwardensApiClient extends AtomHttpApi.Service<HexwardensApiClient>()(
	'HexwardensApiClient',
	{
		api: HexwardensApi,
		httpClient: FetchHttpClient.layer,
		transformClient: attachBearer
	}
) {}
