import { assert } from 'vite-plus/test'
import { Schema } from 'effect'
import { type PlatformRateLimiter } from './platform-rate-limit'

type MiddlewareInput = {
	request: Request
	handlerType: string
	next: () => Promise<{ response: Response }>
}
type Middleware = (
	input: MiddlewareInput
) => Promise<Response | { response: Response }>
const middleware: Middleware[] = []
type TestBindings = {
	BETTER_AUTH_URL: string
	WEB_RATE_LIMITER: PlatformRateLimiter | undefined
}
const bindings: TestBindings = {
	BETTER_AUTH_URL: 'https://web.example',
	WEB_RATE_LIMITER: undefined
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- Capture Start host registration and execute the real native-limit middleware without a framework server.
vi.mock('@tanstack/react-start', () => ({
	createMiddleware: () => ({
		server: (handler: Middleware) => {
			middleware.push(handler)
			return handler
		}
	}),
	createCsrfMiddleware: () => ({}),
	createStart: <T>(options: () => T) => options()
}))
// oxlint-disable-next-line anti-slop/no-module-mocking -- Substitute Worker host bindings; native limiter and logger implementations remain real.
vi.mock('cloudflare:workers', () => ({ env: bindings }))

const decodeLog = Schema.decodeUnknownSync(
	Schema.fromJsonString(
		Schema.Struct({
			event: Schema.String,
			level: Schema.String,
			http: Schema.Struct({ method: Schema.String, path: Schema.String }),
			status: Schema.Finite
		})
	)
)

describe('auth native-limit rejection path redaction', () => {
	afterEach(() => vi.restoreAllMocks())

	it.each(['denied', 'missing', 'failed'])(
		'redacts path and query when binding is %s',
		async (decision) => {
			const start = await import('../start')
			expect(start.startInstance).toBeDefined()
			const handler = middleware[1]
			assert(handler !== undefined)
			bindings.WEB_RATE_LIMITER =
				decision === 'missing'
					? undefined
					: {
							limit: () =>
								decision === 'failed'
									? Promise.reject(new Error('SYNTHETIC_PROVIDER_TOKEN'))
									: Promise.resolve({ success: false })
						}
			const log = vi.spyOn(console, 'log').mockImplementation(() => {})
			const next = vi.fn<MiddlewareInput['next']>()
			const response = await handler({
				request: new Request(
					'https://web.example/api/auth/unknown/%53YNTHETIC_PATH_TOKEN?token=SYNTHETIC_QUERY_TOKEN'
				),
				handlerType: 'router',
				next
			})
			assert(response instanceof Response)
			expect(response.status).toBe(decision === 'denied' ? 429 : 503)
			expect(next).not.toHaveBeenCalled()
			expect(log).toHaveBeenCalledTimes(1)
			expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC')
			expect(decodeLog(log.mock.calls[0]?.[0])).toMatchObject({
				event:
					decision === 'denied'
						? 'http_rate_limited'
						: 'rate_limit_unavailable',
				level: 'warn',
				http: { method: 'GET', path: '/api/auth/$' },
				status: response.status
			})
		}
	)
})
