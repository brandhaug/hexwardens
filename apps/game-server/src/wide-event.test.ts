const isString = Schema.is(Schema.String)
const decodeJson = Schema.decodeUnknownSync(Schema.Json)
import { assert } from 'vite-plus/test'
import { it as effectIt } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import * as TestClock from 'effect/testing/TestClock'
import {
	createRequestWideEvent,
	createWideEvent,
	withSpanRecording,
	type SpanSink
} from './wide-event'

function captureConsole() {
	return vi.spyOn(console, 'log').mockImplementation(() => {})
}

function emittedEvent(spy: ReturnType<typeof captureConsole>) {
	expect(spy).toHaveBeenCalledTimes(1)
	const line = spy.mock.calls[0]?.[0]
	assert(isString(line))
	return decodeJson(JSON.parse(line))
}

describe('createWideEvent', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('emits exactly one JSON line with deep-merged context', () => {
		const spy = captureConsole()
		const log = createWideEvent()
		log.set({ lobby: { id: 'lobby-1' } })
		log.set({ event: 'lobby_created', lobby: { inviteCode: 'ABC123' } })
		log.emit({ status: 200 })

		expect(emittedEvent(spy)).toMatchObject({
			level: 'info',
			service: 'hexwardens-game-server',
			event: 'lobby_created',
			lobby: { id: 'lobby-1', inviteCode: 'ABC123' },
			status: 200
		})
	})

	it('upgrades the level to error and attaches the structured error', () => {
		const spy = captureConsole()
		const log = createWideEvent()
		log.set({ event: 'lobby_ws_error' })
		log.error(new Error('password=private-credential'))
		log.emit()

		expect(emittedEvent(spy)).toMatchObject({
			level: 'error',
			event: 'lobby_ws_error',
			error: { name: 'Error' }
		})
		expect(JSON.stringify(emittedEvent(spy))).not.toContain(
			'private-credential'
		)
	})
})

describe('createRequestWideEvent', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('seeds the HTTP envelope from the request', () => {
		const spy = captureConsole()
		const log = createRequestWideEvent(
			new Request('https://game.hexwardens.com/lobby/join', {
				method: 'POST'
			})
		)
		log.emit({ status: 404 })

		expect(emittedEvent(spy)).toMatchObject({
			http: { method: 'POST', path: '/lobby/join' },
			status: 404
		})
	})
})

describe('withSpanRecording', () => {
	effectIt.effect('folds span timings into the sink, cumulative per name', () =>
		Effect.gen(function* () {
			let latest: Parameters<SpanSink['set']>[0] = {}
			const sink = {
				set: (fields: Parameters<SpanSink['set']>[0]) => {
					latest = fields
				}
			}

			yield* Effect.gen(function* () {
				yield* TestClock.adjust('50 millis').pipe(Effect.withSpan('db.query'))
				yield* TestClock.adjust('30 millis').pipe(Effect.withSpan('db.query'))
				yield* TestClock.adjust('5 millis').pipe(Effect.withSpan('auth.verify'))
			}).pipe(withSpanRecording(sink))

			// oxlint-disable-next-line vitest/no-standalone-expect -- This assertion runs inside an Effect Vitest test.
			expect(latest).toEqual({
				spans: {
					'db.query': { ms: 80, count: 2 },
					'auth.verify': { ms: 5, count: 1 }
				}
			})
		})
	)

	effectIt.effect('marks failed spans without losing the timing', () =>
		Effect.gen(function* () {
			let latest: Parameters<SpanSink['set']>[0] = {}
			const sink = {
				set: (fields: Parameters<SpanSink['set']>[0]) => {
					latest = fields
				}
			}

			class BoomError extends Schema.TaggedError<BoomError>()('BoomError', {
				message: Schema.String
			}) {}
			const failing = TestClock.adjust('10 millis').pipe(
				Effect.andThen(Effect.fail(new BoomError({ message: 'boom' }))),
				Effect.withSpan('db.write')
			)
			yield* failing.pipe(Effect.result, withSpanRecording(sink))

			// oxlint-disable-next-line vitest/no-standalone-expect -- This assertion runs inside an Effect Vitest test.
			expect(latest).toEqual({
				spans: { 'db.write': { ms: 10, count: 1, failed: 1 } }
			})
		})
	)

	it('lands span fields on the emitted wide event', () => {
		const spy = captureConsole()
		const log = createWideEvent()
		log.set({ event: 'profile_loaded' })
		Effect.runSync(
			Effect.void.pipe(Effect.withSpan('db.profile'), withSpanRecording(log))
		)
		log.emit({ status: 200 })

		expect(emittedEvent(spy)).toMatchObject({
			event: 'profile_loaded',
			status: 200,
			spans: { 'db.profile': { count: 1 } }
		})
	})
})
