import { createFileRoute } from '@tanstack/react-router'
import { Effect } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import { toHttpEffect } from 'effectful-better-auth'
import { Auth } from '@/lib/auth.server'
import { authRuntime } from '@/lib/auth-runtime'
import { runWithRequestWideEvent } from '@/lib/wide-event-logger'

// The Auth service comes from the per-isolate `authRuntime` — one memoized
// better-auth instance per isolate, so the in-memory rate-limit counters
// accumulate across requests. Only the request is provided per call.
const handle = ({ request }: { request: Request }): Promise<Response> =>
	runWithRequestWideEvent(
		request,
		toHttpEffect(Auth.Tag).pipe(
			Effect.provideService(
				HttpServerRequest.HttpServerRequest,
				HttpServerRequest.fromWeb(request)
			),
			Effect.map((response) => HttpServerResponse.toWeb(response))
		),
		(program) => authRuntime.runPromise(program),
		'auth_api'
	)

export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			GET: handle,
			POST: handle
		}
	}
})
