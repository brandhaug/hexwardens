import { env } from 'cloudflare:workers'
import { Effect } from 'effect'
import { checkPlatformRateLimit } from '@/lib/platform-rate-limit'
import { requestLogPath, wideEventLoggerLayer } from '@/lib/wide-event-logger'
import {
	createCsrfMiddleware,
	createMiddleware,
	createStart
} from '@tanstack/react-start'

const securityHeaders = createMiddleware({ type: 'request' }).server(
	async ({ next }) => {
		const result = await next()
		const headers = new Headers(result.response.headers)
		headers.set('X-Content-Type-Options', 'nosniff')
		headers.set('X-Frame-Options', 'DENY')
		headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
		headers.set(
			'Content-Security-Policy',
			"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
		)
		// SSR includes session state; server functions include bearer tokens.
		headers.set('Cache-Control', 'private, no-store')
		return {
			...result,
			response: new Response(result.response.body, {
				status: result.response.status,
				statusText: result.response.statusText,
				headers
			})
		}
	}
)

const platformRateLimit = createMiddleware({ type: 'request' }).server(
	async ({ request, handlerType, next }) => {
		if (
			handlerType === 'serverFn' ||
			new URL(request.url).pathname.startsWith('/api/auth/')
		) {
			const refusal = await checkPlatformRateLimit(
				request,
				env.WEB_RATE_LIMITER,
				env.BETTER_AUTH_URL
			)
			if (refusal !== null) {
				Effect.runSync(
					Effect.logWarning({
						event:
							refusal.status === 429
								? 'http_rate_limited'
								: 'rate_limit_unavailable',
						http: {
							method: request.method,
							path: requestLogPath(request)
						},
						status: refusal.status
					}).pipe(Effect.provide(wideEventLoggerLayer))
				)
				return refusal
			}
		}
		return next()
	}
)

export const startInstance = createStart(() => ({
	requestMiddleware: [
		securityHeaders,
		createCsrfMiddleware({
			filter: ({ handlerType }) => handlerType === 'serverFn'
		}),
		platformRateLimit
	]
}))
