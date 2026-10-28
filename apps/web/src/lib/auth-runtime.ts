// oxlint-disable-next-line import/no-unassigned-import -- Start requires this marker to reject client imports.
import '@tanstack/react-start/server-only'
import { Layer, ManagedRuntime } from 'effect'
import { Auth } from '@/lib/auth.server'
import { wideEventLoggerLayer } from '@/lib/wide-event-logger'

/**
 * Per-isolate runtime for auth-touching server work. `Auth.layer` is
 * memoized here, so one better-auth instance serves every request an isolate
 * handles — which is what makes better-auth's in-memory `rateLimit` counters
 * accumulate instead of resetting on each request. The wide-event logger
 * rides along so `runWithServerContext` runs emit through it without a
 * per-run provide.
 *
 * The runtime builds its context lazily on the first run, so importing this
 * module never touches `env` — required for the local workers shim, where
 * bindings only exist after the shim module has initialized Miniflare.
 */
export const authRuntime = ManagedRuntime.make(
	Layer.mergeAll(Auth.layer, wideEventLoggerLayer)
)

/** The services `authRuntime` satisfies — what `runWithServerContext` may
 * leave in an effect's requirements beyond `ServerContextTag`. */
export type AuthRuntimeServices = ManagedRuntime.ManagedRuntime.Services<
	typeof authRuntime
>
