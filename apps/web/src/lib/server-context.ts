// oxlint-disable-next-line import/no-unassigned-import -- Start requires this marker to reject client imports.
import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { Effect } from 'effect'
import { createDb } from '@hexwardens/db/client'
import { authRuntime, type AuthRuntimeServices } from '@/lib/auth-runtime'
import { runWithRequestWideEvent } from '@/lib/wide-event-logger'
import { createTokenSigner } from '@/lib/game-token.server'
import {
	ServerContextTag,
	type Database,
	type ServerContext,
	type TokenSigner
} from '@/lib/server-context-tag'

export function createServerContext(request: Request): ServerContext {
	let dbInstance: Database | null = null
	let signer: TokenSigner | null = null

	function db(): Database {
		if (dbInstance === null) {
			dbInstance = createDb(env.DB)
		}
		return dbInstance
	}

	function getSigner(): TokenSigner {
		if (signer === null) {
			signer = createTokenSigner(env.AUTH_JWT_SECRET)
		}
		return signer
	}

	return {
		request,
		db,
		mintUserToken(userId, username) {
			return getSigner().sign(userId, username)
		},
		mintGuestToken() {
			return getSigner().signGuest()
		}
	}
}

/**
 * Run an Effect against a per-request `ServerContextTag` and return its
 * resolved value as a Promise. Used by the `createServerFn` handlers
 * that still run Effect for session-bound work (auth, daily, game-token).
 * Cross-origin REST endpoints flow through `apps/game-server`'s HttpApi
 * via atom queries instead.
 *
 * Runs happen on the per-isolate `authRuntime`, which satisfies `Auth.Tag`
 * from a single memoized better-auth instance (auth-runtime.ts) — handlers
 * no longer provide `Auth.layer` themselves. Only `ServerContextTag` is
 * per-request.
 *
 * Every run emits one wide event (outcome, duration, error context) through
 * the Effect logger — see `wide-event-logger.ts`.
 */
export const runWithServerContext = <A, E>(
	request: Request,
	effect: Effect.Effect<A, E, ServerContextTag | AuthRuntimeServices>
): Promise<A> =>
	runWithRequestWideEvent(
		request,
		effect.pipe(
			Effect.provideService(ServerContextTag, createServerContext(request))
		),
		(program) => authRuntime.runPromise(program)
	)
