/**
 * Per-socket WebSocket inbound-message gate: size cap plus a fixed-window
 * rate limit. Both DOs run every inbound frame through a gate before any
 * decoding — `logic.onRawMessage` / `decodeClientMessage` must never see a
 * frame from a socket that is over budget.
 *
 * Rate state is in-memory (WeakMap keyed by socket) and intentionally resets
 * on hibernation wake — a fresh window after a wake is harmless, and durable
 * attachments stay reserved for connection metadata.
 */

export const maxWsMessageChars = 16 * 1024
export const wsRateWindowMs = 10_000
export const wsRateMaxMessages = 60
/** Past this multiple of the window budget the socket is closed outright. */
const abuseMultiplier = 5

export type WsGateResult =
	| { kind: 'ok' }
	| { kind: 'too-large' }
	/** Over budget for this window. `firstOverage` is true exactly once per window so callers can notify without spamming. */
	| { kind: 'rate-limited'; firstOverage: boolean }
	/** Grossly over budget — caller should close the socket. */
	| { kind: 'abusive' }

export interface WsMessageGate {
	check(socket: WeakKey, message: string, now: number): WsGateResult
}

export function createWsMessageGate(
	options: {
		maxChars?: number
		windowMs?: number
		maxMessages?: number
	} = {}
): WsMessageGate {
	const maxChars = options.maxChars ?? maxWsMessageChars
	const windowMs = options.windowMs ?? wsRateWindowMs
	const maxMessages = options.maxMessages ?? wsRateMaxMessages
	const rates = new WeakMap<WeakKey, { windowStart: number; count: number }>()

	return {
		check(socket, message, now) {
			if (message.length > maxChars) {
				return { kind: 'too-large' }
			}

			const rate = rates.get(socket)
			if (!rate || now - rate.windowStart >= windowMs) {
				rates.set(socket, { windowStart: now, count: 1 })
				return { kind: 'ok' }
			}

			rate.count++
			if (rate.count > maxMessages * abuseMultiplier) {
				return { kind: 'abusive' }
			}
			if (rate.count > maxMessages) {
				return {
					kind: 'rate-limited',
					firstOverage: rate.count === maxMessages + 1
				}
			}
			return { kind: 'ok' }
		}
	}
}
