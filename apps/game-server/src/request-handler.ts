import { Effect, Layer, Result, Schema, Tracer } from 'effect'
import { HttpRouter } from 'effect/http'
import { layerFromD1 } from '@hexwardens/db/effect'
import { makeApiLive } from './api-router'
import { checkPlatformRateLimit } from './platform-rate-limit'
import { withSecurityHeaders } from './response-headers'
import { envConfigFor } from './config'
import { applyCorsGate, withCorsOrigin } from './cors'
import { checkHttpRateLimit, rateLimitScopeForRequest } from './http-rate-limit'
import { presenceCount } from './presence'
import { presenceLayerFromCount } from './presence-service'
import { type Env } from './types'
import {
	createRequestWideEvent,
	spanRecordingTracer,
	type WideEvent
} from './wide-event'

class RouteError extends Schema.TaggedError<RouteError>()('RouteError', {
	message: Schema.String,
	cause: Schema.optional(Schema.Unknown)
}) {}

// Built per request (route() calls this once per API request), so the
// span-recording tracer can be scoped to that request's wide event —
// `db.*` / `Effect.fn` span timings land on the same canonical log line.
const apiHandlerForEnv = (env: Env, wide: WideEvent) =>
	HttpRouter.toWebHandler(
		makeApiLive(
			env,
			layerFromD1(env.DB),
			presenceLayerFromCount(() => presenceCount(env))
		).pipe(
			Layer.provideMerge(
				Layer.succeed(Tracer.Tracer, spanRecordingTracer(wide))
			)
		),
		{ disableLogger: true }
	).handler

export function handleFetch(
	request: Request,
	env: Env
): Effect.Effect<Response> {
	return Effect.gen(function* () {
		const log = createRequestWideEvent(request)
		const url = new URL(request.url)
		log.set({ route: url.pathname })

		const config = yield* Effect.result(envConfigFor(env))
		if (Result.isFailure(config)) {
			log.set({ event: 'config_invalid' })
			log.error(new Error(String(config.failure)))
			log.emit({ status: 500 })
			return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const gate = applyCorsGate(request, config.success.corsPolicy)

		if (gate.response !== null) {
			if (gate.response.status === 403) {
				log.set({
					event: 'cors_rejected',
					origin: request.headers.get('Origin')
				})
			}
			log.emit({ status: gate.response.status })
			return gate.response
		}

		if (url.pathname !== '/health') {
			const protection = yield* Effect.promise(() =>
				checkPlatformRateLimit(
					request,
					env.GAME_RATE_LIMITER,
					env.ALLOWED_ORIGIN
				)
			)
			if (protection !== null) {
				log.set({
					event:
						protection.status === 429
							? 'http_rate_limited'
							: 'rate_limit_unavailable',
					reason: 'platform'
				})
				log.emit({ status: protection.status })
				return withCorsOrigin(protection, gate.corsOrigin)
			}
		}

		const rateLimitScope = rateLimitScopeForRequest(
			request,
			url,
			env.HEXWARDENS_DISABLE_RATE_LIMIT,
			env.ALLOWED_ORIGIN
		)
		if (rateLimitScope !== null) {
			const rateLimit = checkHttpRateLimit(request, rateLimitScope)
			if (rateLimit.kind === 'limited') {
				log.set({
					event: 'http_rate_limited',
					reason: rateLimitScope,
					origin: request.headers.get('Origin')
				})
				log.emit({ status: 429 })
				return withCorsOrigin(
					new Response(JSON.stringify({ error: 'Too many requests' }), {
						status: 429,
						headers: {
							'Content-Type': 'application/json',
							'Retry-After': String(rateLimit.retryAfterSeconds),
							'Access-Control-Expose-Headers': 'Retry-After'
						}
					}),
					gate.corsOrigin
				)
			}
		}

		const routed = yield* Effect.tryPromise({
			try: () => Promise.resolve(route(request, url, env, log)),
			catch: (cause) =>
				new RouteError({
					message: 'Request routing failed',
					cause
				})
		}).pipe(
			Effect.catchTag(['RouteError'], (error) =>
				Effect.sync(() => {
					log.error(
						error.cause instanceof Error
							? error.cause
							: new Error('Request routing failed')
					)
					return new Response(
						JSON.stringify({ error: 'Internal server error' }),
						{
							status: 500,
							headers: { 'Content-Type': 'application/json' }
						}
					)
				})
			)
		)
		const response = withCorsOrigin(routed, gate.corsOrigin)
		log.emit({ status: response.status })
		return response
	}).pipe(Effect.map(withSecurityHeaders))
}

function route(
	request: Request,
	url: URL,
	env: Env,
	wide: WideEvent
): Response | Promise<Response> {
	if (url.pathname === '/lobby/create' && request.method === 'POST') {
		const id = env.MATCHMAKER.idFromName('main')
		return env.MATCHMAKER.get(id).fetch(request)
	}

	if (url.pathname === '/lobby/join' && request.method === 'POST') {
		const id = env.MATCHMAKER.idFromName('main')
		return env.MATCHMAKER.get(id).fetch(request)
	}

	if (url.pathname === '/lobby/public-queue' && request.method === 'POST') {
		const id = env.MATCHMAKER.idFromName('main')
		return env.MATCHMAKER.get(id).fetch(request)
	}

	if (
		url.pathname.startsWith('/lobby/') &&
		request.headers.get('Upgrade') === 'websocket'
	) {
		const id = env.MATCHMAKER.idFromName('main')
		return env.MATCHMAKER.get(id).fetch(request)
	}

	if (
		url.pathname.startsWith('/match/') &&
		request.headers.get('Upgrade') === 'websocket'
	) {
		const matchId = url.pathname.split('/')[2]
		if (!matchId) {
			return new Response(JSON.stringify({ error: 'Missing match ID' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		const id = env.MATCH.idFromName(matchId)
		return env.MATCH.get(id).fetch(request)
	}

	return apiHandlerForEnv(env, wide)(request)
}
