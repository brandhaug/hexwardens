import { Context, Effect, Exit, Layer, ManagedRuntime, Schema } from 'effect'
import { wideEventLoggerLayer, withRequestWideEvent } from './wide-event-logger'

const decodeLog = Schema.decodeUnknownSync(
	Schema.fromJsonString(
		Schema.Struct({
			event: Schema.String,
			level: Schema.String,
			http: Schema.Struct({ method: Schema.String, path: Schema.String }),
			outcome: Schema.String,
			auth_provider: Schema.optional(
				Schema.Struct({ count: Schema.Finite, level: Schema.String })
			)
		})
	)
)

class PrivateFailure extends Schema.TaggedError<PrivateFailure>()(
	'PrivateFailure',
	{ message: Schema.String }
) {}

describe('server function failure logging', () => {
	afterEach(() => vi.restoreAllMocks())

	it.each(['failure', 'defect'])(
		'logs one redacted completion on %s and preserves failure',
		async (kind) => {
			const log = vi.spyOn(console, 'log').mockImplementation(() => {})
			const effect =
				kind === 'failure'
					? Effect.fail(new PrivateFailure({ message: 'private-credential' }))
					: Effect.die(new Error('private-credential'))
			const exit = await Effect.runPromiseExit(
				effect.pipe(
					withRequestWideEvent(
						new Request('https://game.example/_serverFn?token=private-token')
					),
					Effect.provide(wideEventLoggerLayer)
				)
			)
			expect(Exit.isFailure(exit)).toBe(true)
			expect(log).toHaveBeenCalledTimes(1)
			expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
			expect(JSON.stringify(log.mock.calls)).toContain('server_fn')
		}
	)
})

describe('auth provider diagnostics', () => {
	afterEach(() => vi.restoreAllMocks())

	it('records the severity without exposing provider payloads', async () => {
		const { authProviderLogger } = await import('./wide-event-logger')
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		authProviderLogger.log('error', 'password=private-credential', {
			token: 'private-token'
		})
		expect(log).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
		expect(JSON.stringify(log.mock.calls)).toContain('auth_provider_init')
	})
})

describe('request-owned provider diagnostics', () => {
	afterEach(() => vi.restoreAllMocks())

	it('merges severity and counts across async resumes without leaking provider payloads', async () => {
		const { authProviderLogger } = await import('./wide-event-logger')
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await Effect.runPromise(
			Effect.gen(function* () {
				authProviderLogger.log('error', 'private-password', {
					token: 'private-token'
				})
				yield* Effect.promise(async () => {
					await Promise.resolve()
					authProviderLogger.log('warn', 'private-provider-text')
				})
				authProviderLogger.log('info', 'private-message')
			}).pipe(
				withRequestWideEvent(
					new Request('https://web.example/_serverFn/login?token=private-query')
				),
				Effect.provide(wideEventLoggerLayer)
			)
		)
		expect(log).toHaveBeenCalledTimes(1)
		const events = JSON.stringify(log.mock.calls)
		expect(events).not.toContain('private-')
		expect(events).toContain('server_fn')
		expect(events).toContain('error')
		expect(events).toContain('auth_provider')
		expect(decodeLog(log.mock.calls[0]?.[0])).toMatchObject({
			level: 'error',
			outcome: 'success',
			auth_provider: { count: 3, level: 'error' }
		})
	})

	it('isolates interleaved request fibers and asynchronous callbacks', async () => {
		const { authProviderLogger } = await import('./wide-event-logger')
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		const firstReady = Promise.withResolvers<undefined>()
		const secondReady = Promise.withResolvers<undefined>()
		const first = Effect.gen(function* () {
			firstReady.resolve(undefined)
			yield* Effect.promise(() => secondReady.promise)
			authProviderLogger.log('error', 'private-first')
		})
		const second = Effect.promise(async () => {
			await firstReady.promise
			authProviderLogger.log('warn', 'private-second')
			secondReady.resolve(undefined)
		})
		await Effect.runPromise(
			Effect.all(
				[
					first.pipe(
						withRequestWideEvent(new Request('https://web.example/first'))
					),
					second.pipe(
						withRequestWideEvent(new Request('https://web.example/second'))
					)
				],
				{ concurrency: 'unbounded' }
			).pipe(Effect.provide(wideEventLoggerLayer))
		)
		expect(log).toHaveBeenCalledTimes(2)
		const events = log.mock.calls.map((call) => decodeLog(call[0]))
		expect(events.find((event) => event.http.path === '/first')).toMatchObject({
			level: 'error',
			auth_provider: { count: 1, level: 'error' }
		})
		expect(events.find((event) => event.http.path === '/second')).toMatchObject(
			{ level: 'warn', auth_provider: { count: 1, level: 'warn' } }
		)
		expect(JSON.stringify(events)).not.toContain('private-')
	})
})

describe('request logging runtime boundary', () => {
	afterEach(() => vi.restoreAllMocks())

	it('owns provider diagnostics emitted during asynchronous runtime initialization', async () => {
		const { authProviderLogger, runWithRequestWideEvent } =
			await import('./wide-event-logger')
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		const run = async (program: Effect.Effect<number>) => {
			await Promise.resolve()
			authProviderLogger.log('warn', 'private-initialization')
			return Effect.runPromise(
				program.pipe(Effect.provide(wideEventLoggerLayer))
			)
		}
		expect(
			await runWithRequestWideEvent(
				new Request('https://web.example/initial'),
				Effect.succeed(42),
				run
			)
		).toBe(42)
		expect(log).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(log.mock.calls)).toContain('/initial')
		expect(JSON.stringify(log.mock.calls)).toContain('warn')
		expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
	})

	it('emits one redacted failure when initialization rejects before the Effect starts', async () => {
		const { runWithRequestWideEvent } = await import('./wide-event-logger')
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		const error = new Error('private-initialization-failure')
		await expect(
			runWithRequestWideEvent(
				new Request('https://web.example/initial'),
				Effect.succeed(42),
				() => Promise.reject(error)
			)
		).rejects.toBe(error)
		expect(log).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
	})
})

class TestRuntimeService extends Context.Service<
	TestRuntimeService,
	{ ready: boolean }
>()('TestRuntimeService') {}

describe('shared lazy auth runtime logging', () => {
	afterEach(() => vi.restoreAllMocks())

	it('keeps initialization and concurrent request continuations in their owning context', async () => {
		const { authProviderLogger, runWithRequestWideEvent } =
			await import('./wide-event-logger')
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		const runtime = ManagedRuntime.make(
			Layer.mergeAll(
				Layer.effect(
					TestRuntimeService,
					Effect.gen(function* () {
						yield* Effect.promise(() => Promise.resolve())
						authProviderLogger.log('warn', 'private-init')
						return { ready: true }
					})
				),
				wideEventLoggerLayer
			)
		)
		const program = (level: 'error' | 'info') =>
			Effect.gen(function* () {
				const service = yield* TestRuntimeService
				yield* Effect.yieldNow
				authProviderLogger.log(level, 'private-request')
				return service.ready
			})
		try {
			await Promise.all([
				runWithRequestWideEvent(
					new Request('https://web.example/one'),
					program('error'),
					(effect) => runtime.runPromise(effect)
				),
				runWithRequestWideEvent(
					new Request('https://web.example/two'),
					program('info'),
					(effect) => runtime.runPromise(effect)
				)
			])
			expect(log).toHaveBeenCalledTimes(2)
			const events = log.mock.calls.map((call) => decodeLog(call[0]))
			expect(events.find((event) => event.http.path === '/one')).toMatchObject({
				level: 'error',
				auth_provider: { count: 2, level: 'error' }
			})
			expect(events.find((event) => event.http.path === '/two')).toMatchObject({
				level: 'info',
				auth_provider: { count: 1, level: 'info' }
			})
			expect(JSON.stringify(events)).not.toContain('private-')
		} finally {
			await runtime.dispose()
		}
	})
})
