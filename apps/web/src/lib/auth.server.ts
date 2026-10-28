// oxlint-disable-next-line import/no-unassigned-import -- Start requires this marker to reject client imports.
import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins/username'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Effect, Redacted, Schema } from 'effect'
import { authProviderLogger } from '@/lib/wide-event-logger'
import { authConfigFor } from '@/lib/auth-config'
import {
	plugins,
	service,
	type Session as SessionOf
} from 'effectful-better-auth'
import { createDb } from '@hexwardens/db/client'
import * as schema from '@hexwardens/db/schema'
import { ServerContextTag, type ServerContext } from '@/lib/server-context-tag'

// Options read isolate-scoped `env` bindings, never the request — the layer
// lives in the per-isolate `authRuntime` (see auth-runtime.ts), so one
// better-auth instance serves every request an isolate handles. CF's "Cannot
// perform I/O on behalf of a different request" applies to request-bound I/O
// objects, not `env` bindings. `Effect.gen` defers `env` access until the
// layer first builds, keeping this module inert at import time under the
// local workers shim.
const authOptions = Effect.gen(function* () {
	const config = yield* authConfigFor(env)
	return {
		logger: authProviderLogger,
		secret: Redacted.value(config.secret),
		baseURL: config.baseURL,
		trustedOrigins: config.trustedOrigins,
		database: drizzleAdapter(createDb(env.DB), {
			provider: 'sqlite',
			schema
		}),
		advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
		emailAndPassword: {
			enabled: true
		},
		// Brute-force throttle on credential endpoints. Storage is per-isolate
		// memory — the instance must live in the per-isolate `authRuntime` for
		// the counters to accumulate; a determined distributed attacker can
		// spread across isolates, but single-source credential stuffing (the
		// common case) gets cut off. Move to database storage if attack traffic
		// shows up in the wide events.
		rateLimit: {
			enabled: true,
			window: 60,
			max: 60,
			customRules: {
				'/sign-in/email': { window: 60, max: 10 },
				'/sign-in/username': { window: 60, max: 10 },
				'/sign-up/email': { window: 60, max: 10 }
			}
		},
		// Cookie-integration plugins go last so cookies set by other plugins'
		// hooks are forwarded to the framework cookie store.
		plugins: plugins(username(), tanstackStartCookies())
	}
})

/**
 * The web app's Better Auth service: `Auth.Tag` yields `{ api, instance }`
 * where `api` is the effectful proxy (tagged `BetterAuthApiError` failures)
 * and `instance` is the raw Better Auth instance for `asResponse` /
 * `handler` escape hatches. `Auth.layer` has no requirements and is memoized
 * per isolate inside `authRuntime` (auth-runtime.ts) — one better-auth
 * instance per isolate, so the in-memory rate-limit counters accumulate
 * across requests. Never rebuild the layer per request.
 */
export const Auth = service('web/Auth', authOptions)

type AuthOptions = Effect.Success<typeof authOptions>

export type Session = SessionOf<AuthOptions>

class SessionReadError extends Schema.TaggedError<SessionReadError>()(
	'SessionReadError',
	{ message: Schema.String },
	{ httpApiStatus: 503 }
) {}

/** The current request's session, read via the effectful proxy. */
export const currentSession = Effect.fn('Auth.currentSession')(function* () {
	const ctx = yield* ServerContextTag
	const auth = yield* Auth.Tag
	return yield* auth.api
		.getSession({ headers: ctx.request.headers })
		.pipe(
			Effect.mapError(
				() => new SessionReadError({ message: 'Session unavailable' })
			)
		)
})

/** User token when a session exists, ephemeral guest token otherwise. */
export const mintGameToken = Effect.fn('GameToken.mint')(function* () {
	const ctx = yield* ServerContextTag
	const session = yield* currentSession()
	return yield* Effect.promise(() => mintTokenForSession(ctx, session))
})

export function mintTokenForSession(
	ctx: ServerContext,
	session: Session | null
): Promise<string> {
	if (session?.user) {
		return ctx.mintUserToken(
			session.user.id,
			session.user.username ?? session.user.name
		)
	}
	return ctx.mintGuestToken()
}
