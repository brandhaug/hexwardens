import { Effect, Exit, Logger, Predicate, Tracer } from 'effect'

/**
 * Wide-event logging (canonical log lines) on top of Effect's Logger.
 *
 * One context-rich JSON event per request / lifecycle moment per service —
 * handlers accumulate high-cardinality context (`set`) and emit exactly once
 * at completion (`emit`). The sink is an Effect `Logger` writing structured
 * JSON to the Workers Logs console stream.
 *
 * Durable Object handlers are imperative, so `emit` is itself a run boundary:
 * it runs the one-shot log effect synchronously against the wide-event
 * logger layer. Effect-native code can instead `Effect.log({...})` with
 * {@link wideEventLoggerLayer} provided.
 */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Effect logger accepts arbitrary structured fields; only the logger adapter owns this open contract.
type EventFields = Record<string, unknown>

type SpanSnapshot = Record<
	string,
	{ ms: number; count: number; failed?: number }
>

const service = 'hexwardens-game-server'

function isRecord(value: unknown): value is EventFields {
	return Predicate.isObject(value)
}

/** Nested `set` calls merge per-branch (`{ lobby: { id } }` + `{ lobby: { inviteCode } }`). */
function deepMerge(target: EventFields, source: EventFields): EventFields {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- Merge target retains the external logger field contract.
	const merged: EventFields = { ...target }
	for (const [key, value] of Object.entries(source)) {
		const existing = merged[key]
		merged[key] =
			isRecord(existing) && isRecord(value) ? deepMerge(existing, value) : value
	}
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- Recursive structured log merge must retain all provider field keys.
	return merged
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

export type WideEvent = {
	/** Deep-merges fields into the pending event. */
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Logger accumulator accepts structured context from Effect and host adapters.
	readonly set: (fields: EventFields) => void
	/** Attaches a structured error and upgrades the emitted level to `error`. */
	readonly error: (error: Error) => void
	/** Emits the accumulated event exactly once, optionally merging final fields. */
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Completion fields share the same logger accumulator contract.
	readonly emit: (fields?: EventFields) => void
}

export function createWideEvent(base: EventFields = {}): WideEvent {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- The accumulator receives different context fields over the request lifetime.
	let fields: EventFields = { ...base }
	let failed = false
	return {
		set(next) {
			fields = deepMerge(fields, next)
		},
		error(error) {
			failed = true
			fields = deepMerge(fields, {
				// Provider messages and stacks may contain SQL parameters or tokens.
				error: { name: error instanceof TypeError ? 'TypeError' : 'Error' }
			})
		},
		emit(extra) {
			if (extra) {
				fields = deepMerge(fields, extra)
			}
			const log = failed ? Effect.logError : Effect.log
			Effect.runSync(log(fields).pipe(Effect.provide(wideEventLoggerLayer)))
		}
	}
}

/** Request-scoped wide event seeded with the HTTP envelope. */
export function createRequestWideEvent(request: Request): WideEvent {
	const url = new URL(request.url)
	return createWideEvent({
		http: { method: request.method, path: url.pathname }
	})
}

/** Anything spans can be folded into — a `WideEvent` or a plain collector. */
export type SpanSink = Pick<WideEvent, 'set'>

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
 * A `Tracer` that folds finished spans into the sink as
 * `spans.<name> = { ms, count }` — cumulative across same-name spans (e.g.
 * repeated `db.*` queries), with `failed` added when any of them failed.
 * Every span end writes the full snapshot, so the sink's latest `spans`
 * subtree is always complete.
 */
export function spanRecordingTracer(sink: SpanSink): Tracer.Tracer {
	const totals = new Map<string, SpanTotals>()
	const snapshot = (): SpanSnapshot => {
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
		// oxlint-disable-next-line anti-slop/no-known-value-widening -- Span names are runtime keys with a concrete timing value contract.
		return spans
	}
	const record = (name: string, durationMs: number, failed: boolean) => {
		const entry = totals.get(name) ?? { ms: 0, count: 0, failed: 0 }
		entry.ms += durationMs
		entry.count += 1
		if (failed) {
			entry.failed += 1
		}
		totals.set(name, entry)
		sink.set({ spans: snapshot() })
	}
	return Tracer.make({
		span: (options) => new RecordingSpan(options, record)
	})
}

/**
 * Pipe at a run boundary to make every `Effect.withSpan` / `Effect.fn` span
 * inside the program land on the wide event for that lifecycle moment.
 */
export const withSpanRecording =
	(sink: SpanSink) =>
	<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
		Effect.withTracer(effect, spanRecordingTracer(sink))
