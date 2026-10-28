import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { runWithServerContext } from '@/lib/server-context'
import { checkServerRateLimit } from '@/lib/server-rate-limit'

/**
 * Browser-side error sink. Uncaught errors and unhandled rejections in the
 * client otherwise vanish — React error boundaries only see render errors,
 * and the wide-event stream only sees server-side failures. This server
 * function turns a client error into a `client_error` wide event so
 * dashboards see what users hit in the field.
 */

const clientErrorReport = Schema.Struct({
	message: Schema.String.pipe(Schema.check(Schema.isMaxLength(2000))),
	stack: Schema.optional(
		Schema.String.pipe(Schema.check(Schema.isMaxLength(8000)))
	),
	source: Schema.Literals(['onerror', 'unhandledrejection']),
	url: Schema.String.pipe(Schema.check(Schema.isMaxLength(2000)))
})

export type ClientErrorReport = typeof clientErrorReport.Type

export const reportClientError = createServerFn({ method: 'POST' })
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Start validators must decode unknown transport input.
	.validator((data: unknown): ClientErrorReport =>
		Schema.decodeUnknownSync(clientErrorReport)(data)
	)
	.handler(({ data }) =>
		runWithServerContext(
			getRequest(),
			Effect.gen(function* () {
				const rateLimit = checkServerRateLimit(getRequest(), 'client_error', {
					windowMs: 60_000,
					maxRequests: 20
				})
				if (rateLimit.kind === 'limited') {
					return yield* Effect.log({
						event: 'client_error_rate_limited',
						retry_after_seconds: rateLimit.retryAfterSeconds
					})
				}
				return yield* Effect.log({
					event: 'client_error',
					// Client exception text and URLs may include tokens or personal data.
					// Keep the occurrence and source; never persist the submitted payload.
					'error.source': data.source
				})
			})
		)
	)
