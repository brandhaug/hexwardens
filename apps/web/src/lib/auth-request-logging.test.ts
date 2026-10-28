import { Context, Effect, Schema } from 'effect'
import { assert } from 'vite-plus/test'
import { authProviderLogger, wideEventLoggerLayer } from './wide-event-logger'

class TestAuth extends Context.Service<
	TestAuth,
	{
		instance: { handler: (request: Request) => Promise<Response> }
	}
>()('TestAuth') {}

const provider = vi.fn<(request: Request) => Promise<Response>>()
let handlers:
	| {
			GET: (input: { request: Request }) => Promise<Response>
			POST: (input: { request: Request }) => Promise<Response>
	  }
	| undefined

// oxlint-disable-next-line anti-slop/no-module-mocking -- Capture the file-route host registration while executing its real GET/POST handlers.
vi.mock('@tanstack/react-router', () => ({
	createFileRoute:
		() => (options: { server: { handlers: NonNullable<typeof handlers> } }) => {
			handlers = options.server.handlers
			return options
		}
}))
// oxlint-disable-next-line anti-slop/no-module-mocking -- Provide a typed test auth service to the real effectful-better-auth HTTP adapter.
vi.mock('@/lib/auth.server', () => ({ Auth: { Tag: TestAuth } }))
// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace only the isolate runtime composition with the test auth service layer.
vi.mock('@/lib/auth-runtime', () => ({
	authRuntime: {
		runPromise: <A, E>(effect: Effect.Effect<A, E, TestAuth>) =>
			Effect.runPromise(
				effect.pipe(
					Effect.provideService(TestAuth, { instance: { handler: provider } }),
					Effect.provide(wideEventLoggerLayer)
				)
			)
	}
}))

describe('native auth route request logging', () => {
	afterEach(() => vi.restoreAllMocks())

	it.each(['GET', 'POST'])(
		'logs one redacted %s completion with provider diagnostics and HTTP status',
		async (method) => {
			const route = await import('../routes/api.auth.$')
			expect(route.Route).toBeDefined()
			assert(handlers !== undefined)
			const log = vi.spyOn(console, 'log').mockImplementation(() => {})
			provider.mockImplementation(async () => {
				await Promise.resolve()
				authProviderLogger.log('error', 'private-credential', {
					token: 'private-token'
				})
				return new Response('denied', { status: 401 })
			})
			const handle = method === 'GET' ? handlers.GET : handlers.POST
			const response = await handle({
				request: new Request(
					'https://web.example/api/auth/sign-in/email?token=private-query',
					{ method }
				)
			})
			expect(response.status).toBe(401)
			expect(log).toHaveBeenCalledTimes(1)
			const event = JSON.stringify(log.mock.calls)
			expect(event).toContain('auth_api')
			expect(event).toContain('401')
			expect(event).toContain('auth_provider')
			expect(event).not.toContain('private-')
		}
	)

	it('logs a native provider defect once and preserves rejection', async () => {
		const route = await import('../routes/api.auth.$')
		expect(route.Route).toBeDefined()
		assert(handlers !== undefined)
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		provider.mockRejectedValue(new Error('private-provider-failure'))
		await expect(
			handlers.POST({
				request: new Request('https://web.example/api/auth/sign-in/email', {
					method: 'POST'
				})
			})
		).rejects.toBeDefined()
		expect(log).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
	})
})

const decodeAuthLog = Schema.decodeUnknownSync(
	Schema.fromJsonString(
		Schema.Struct({
			event: Schema.String,
			level: Schema.String,
			http: Schema.Struct({
				method: Schema.String,
				path: Schema.String,
				status: Schema.optional(Schema.Finite)
			}),
			outcome: Schema.String,
			auth_provider: Schema.Struct({
				count: Schema.Finite,
				level: Schema.String
			})
		})
	)
)

describe('native auth callback path redaction', () => {
	afterEach(() => vi.restoreAllMocks())

	it.each([
		{ suffix: 'reset-password/SYNTHETIC_PATH_TOKEN', status: 302 },
		{ suffix: 'reset-password/%53YNTHETIC_ENCODED_TOKEN', status: 401 },
		{ suffix: 'unknown/SYNTHETIC_UNKNOWN_TOKEN', status: 404 },
		{ suffix: 'reset-password/SYNTHETIC_FAILURE_TOKEN', status: 0 }
	])('bounds $suffix on status $status', async ({ suffix, status }) => {
		const route = await import('../routes/api.auth.$')
		expect(route.Route).toBeDefined()
		assert(handlers !== undefined)
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		provider.mockImplementation(async () => {
			await Promise.resolve()
			authProviderLogger.log('error', 'SYNTHETIC_PROVIDER_TOKEN', {
				token: 'SYNTHETIC_ARGUMENT_TOKEN'
			})
			if (status === 0) {
				throw new Error('SYNTHETIC_FAILURE_MESSAGE')
			}
			return new Response(null, { status })
		})
		const result = handlers.GET({
			request: new Request(
				`https://web.example/api/auth/${suffix}?token=SYNTHETIC_QUERY_TOKEN`
			)
		})
		const observedStatus = await result.then(
			(response) => response.status,
			() => 0
		)
		expect(observedStatus).toBe(status)
		expect(log).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC')
		const event = decodeAuthLog(log.mock.calls[0]?.[0])
		expect(event).toMatchObject({
			event: 'auth_api',
			level: 'error',
			http: { method: 'GET', path: '/api/auth/$' },
			outcome: status === 302 ? 'success' : 'error',
			auth_provider: { count: 1, level: 'error' }
		})
		expect(event.http.status).toBe(status === 0 ? undefined : status)
	})
})
