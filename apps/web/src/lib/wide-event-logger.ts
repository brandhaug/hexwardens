import { AsyncLocalStorage } from 'node:async_hooks'
import { errorDiagnostics } from '@/lib/error-diagnostics'
import { Cause, Effect, Exit, Logger, Predicate, Tracer } from 'effect'

/**
 * Wide-event logging (canonical log lines) on top of Effect's Logger.
 *
 * One context-rich JSON event per Effect-backed server-function request —
 * emitted at completion with outcome, duration, and error context. The sink
 * is an Effect `Logger` writing structured JSON to the Workers Logs console
 * stream. Field names stay in parity with `apps/game-server` (`http.method`,
 * `http.path`, `event`, `error.*`) so dashboards aggregate across surfaces.
 */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Effect logger accepts arbitrary structured fields; only the logger adapter owns this open contract.
type EventFields = Record<string, unknown>

type SpanSnapshot = Record<
	string,
	{ ms: number; count: number; failed?: number }
>

const service = 'hexwardens'

function isRecord(value: unknown): value is EventFields {
	return Predicate.isObject(value)
}

const formatWideEvent = Logger.make<unknown, string>((options) => {
	// `Effect.log(...args)` delivers its arguments as an array — a single
	// record argument IS the wide event.
	const raw =
		Array.isArray(options.message) && options.message.length === 1
			? options.message[0]
			: options.message
	const fields = isRecord(raw) ? raw : { message: raw }
	return JSON.stringify({
		timestamp: options.date.toISOString(),
		level: options.logLevel.toLowerCase(),
		service,
		...fields
	})
})

export const wideEventLoggerLayer = Logger.layer([
	Logger.withConsoleLog(formatWideEvent)
])

type SpanTotals = { ms: number; count: number; failed: number }

class RecordingSpan extends Tracer.NativeSpan {
	readonly #onEnd: (name: string, durationMs: number, failed: boolean) => void

	constructor(
		options: ConstructorParameters<typeof Tracer.NativeSpan>[0],
		onEnd: (name: string, durationMs: number, failed: boolean) => void
	) {
		super(options)
		this.#onEnd = onEnd
	}

	override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
		super.end(endTime, exit)
		this.#onEnd(
			this.name,
			Number(endTime - this.startTime) / 1e6,
			Exit.isFailure(exit)
		)
	}
}

/**
 * Per-request span collector: a `Tracer` that folds every finished span
 * (`Effect.fn`, `Effect.withSpan`) into `spans.<name> = { ms, count }`,
 * cumulative across same-name spans. Mirrors `apps/game-server`'s
 * `wide-event.ts` so dashboards read one shape.
 */
function makeSpanCollector(diagnostics: ProviderDiagnostics) {
	const totals = new Map<string, SpanTotals>()
	const tracer = Tracer.make({
		// Effect fibers may share scheduler callbacks. Restore the request store for
		// every primitive, not just the initial Promise or fiber invocation.
		context: (primitive, fiber) =>
			providerContext.run(diagnostics, () =>
				primitive['~effect/Effect/evaluate'](fiber)
			),
		span: (options) =>
			new RecordingSpan(options, (name, durationMs, failed) => {
				const entry = totals.get(name) ?? { ms: 0, count: 0, failed: 0 }
				entry.ms += durationMs
				entry.count += 1
				if (failed) {
					entry.failed += 1
				}
				totals.set(name, entry)
			})
	})
	const snapshot = (): SpanSnapshot | null => {
		if (totals.size === 0) {
			return null
		}
		const spans: SpanSnapshot = {}
		for (const [name, entry] of totals) {
			const timing: SpanSnapshot[string] = {
				ms: Math.round(entry.ms * 100) / 100,
				count: entry.count
			}
			if (entry.failed > 0) {
				timing.failed = entry.failed
			}
			spans[name] = timing
		}
		return spans
	}
	return { tracer, snapshot }
}

type ProviderLevel = 'debug' | 'info' | 'warn' | 'error'
type ProviderDiagnostics = {
	count: number
	level: ProviderLevel
	completed: boolean
}
const providerContext = new AsyncLocalStorage<ProviderDiagnostics>()
const severity = { debug: 0, info: 1, warn: 2, error: 3 }

function newDiagnostics(): ProviderDiagnostics {
	return { count: 0, level: 'debug', completed: false }
}

type RequestHttpFields = { method: string; path: string; status?: number }
type RequestEvent = {
	event: 'server_fn' | 'auth_api'
	http: RequestHttpFields
	duration_ms: number
	outcome: 'success' | 'error'
	spans?: SpanSnapshot
	auth_provider?: { count: number; level: ProviderLevel }
	error?: ReturnType<typeof errorDiagnostics>
}

/** Auth callback segments can contain credentials; log only the catchall route. */
export function requestLogPath(
	request: Request,
	event: 'auth_api' | 'server_fn' = 'server_fn'
): string {
	const path = new URL(request.url).pathname
	return event === 'auth_api' ||
		path === '/api/auth' ||
		path.startsWith('/api/auth/')
		? '/api/auth/$'
		: path
}

function completionEvent<A, E>(
	request: Request,
	event: 'server_fn' | 'auth_api',
	start: number,
	diagnostics: ProviderDiagnostics,
	exit: Exit.Exit<A, E>,
	spans: SpanSnapshot | null
) {
	if (diagnostics.completed) {
		return Effect.void
	}
	diagnostics.completed = true
	const response =
		Exit.isSuccess(exit) && exit.value instanceof Response ? exit.value : null
	const failed =
		Exit.isFailure(exit) || (response !== null && response.status >= 400)
	const http: RequestHttpFields = {
		method: request.method,
		path: requestLogPath(request, event)
	}
	if (response !== null) {
		http.status = response.status
	}
	const fields: RequestEvent = {
		event,
		http,
		duration_ms: Date.now() - start,
		outcome: failed ? 'error' : 'success'
	}
	if (spans !== null) {
		fields.spans = spans
	}
	if (diagnostics.count > 0) {
		fields.auth_provider = {
			count: diagnostics.count,
			level: diagnostics.level
		}
	}
	if (Exit.isFailure(exit)) {
		fields.error = errorDiagnostics(Cause.squash(exit.cause))
	}
	if (failed || diagnostics.level === 'error') {
		return Effect.logError(fields)
	}
	if (diagnostics.level === 'warn') {
		return Effect.logWarning(fields)
	}
	return Effect.log(fields)
}

function observeRequest<A, E, R>(
	request: Request,
	event: 'server_fn' | 'auth_api',
	diagnostics: ProviderDiagnostics,
	start: number,
	effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
	const collector = makeSpanCollector(diagnostics)
	return Effect.withTracer(effect, collector.tracer).pipe(
		Effect.onExit((exit) =>
			completionEvent(
				request,
				event,
				start,
				diagnostics,
				exit,
				collector.snapshot()
			)
		)
	)
}

/** One completion per execution; provider text never enters the request store. */
export const withRequestWideEvent =
	(request: Request, event: 'server_fn' | 'auth_api' = 'server_fn') =>
	<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
		Effect.suspend(() =>
			observeRequest(request, event, newDiagnostics(), Date.now(), effect)
		)

/** Covers lazy runtime initialization too, before the request Effect is entered. */
export function runWithRequestWideEvent<A, E, R>(
	request: Request,
	effect: Effect.Effect<A, E, R>,
	run: (effect: Effect.Effect<A, E, R>) => Promise<A>,
	event: 'server_fn' | 'auth_api' = 'server_fn'
): Promise<A> {
	const diagnostics = newDiagnostics()
	const start = Date.now()
	return providerContext
		.run(diagnostics, () =>
			run(observeRequest(request, event, diagnostics, start, effect))
		)
		.then(
			(value) => {
				Effect.runSync(
					completionEvent(
						request,
						event,
						start,
						diagnostics,
						Exit.succeed(value),
						null
					).pipe(Effect.provide(wideEventLoggerLayer))
				)
				return value
			},
			(cause: unknown) => {
				Effect.runSync(
					completionEvent(
						request,
						event,
						start,
						diagnostics,
						Exit.fail(cause),
						null
					).pipe(Effect.provide(wideEventLoggerLayer))
				)
				// oxlint-disable-next-line effect/noThrowStatement -- Preserve the host Promise rejection unchanged after logging; this is not an Effect error conversion.
				throw cause
			}
		)
}

/** Better Auth diagnostics are bounded metadata on the owning request. */
export const authProviderLogger = {
	log(level: ProviderLevel, _message: string, ..._args: unknown[]): void {
		const diagnostics = providerContext.getStore()
		if (diagnostics !== undefined) {
			if (!diagnostics.completed) {
				diagnostics.count += 1
				if (severity[level] > severity[diagnostics.level]) {
					diagnostics.level = level
				}
			}
			return
		}
		const event = { event: 'auth_provider_init', provider_level: level }
		const logByLevel = {
			error: Effect.logError,
			warn: Effect.logWarning,
			info: Effect.log,
			debug: Effect.log
		}
		Effect.runSync(
			logByLevel[level](event).pipe(Effect.provide(wideEventLoggerLayer))
		)
	}
}
