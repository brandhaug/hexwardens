// Minimal ambient declarations for host-provided globals.
//
// This package is environment-agnostic (no DOM or Node type libs in
// tsconfig), but every supported host — browsers, Cloudflare Workers,
// Node/vitest — provides these globals at runtime. Declare only the exact
// surface the package uses; do not add DOM/node libs instead.

declare const crypto: { randomUUID(): string }

declare const process: { env: { NODE_ENV?: string } }

interface TimeoutHandle {
	readonly __timeoutHandleBrand?: never
}
declare function setTimeout(
	handler: () => void,
	timeout?: number
): TimeoutHandle
declare function clearTimeout(handle: TimeoutHandle): void

interface AbortSignal {
	readonly aborted: boolean
	readonly reason: unknown
	addEventListener(
		type: 'abort',
		listener: () => void,
		options?: { once?: boolean }
	): void
	removeEventListener(type: 'abort', listener: () => void): void
}
interface AbortController {
	readonly signal: AbortSignal
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- DOM-compatible cancellation accepts arbitrary rejection reasons
	abort(reason?: unknown): void
}
declare const AbortController: {
	new (): AbortController
	prototype: AbortController
}

/** Native clone is available in every supported browser and Workers host. */
declare function structuredClone<T>(value: T): T
