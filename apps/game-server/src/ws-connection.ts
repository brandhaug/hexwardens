import { Predicate, Schema } from 'effect'
import { tribes, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { encodeServerWireFrame } from '@hexwardens/game-logic/multiplayer/codec'
import { type ServerMessage } from './types'

/**
 * WebSocket connection lifecycle shared by the `Match` and `Matchmaker`
 * Durable Objects. Owns the four per-socket concerns the DOs used to
 * duplicate:
 *
 * - **Accept-and-attach.** `accept` registers the socket for hibernation
 *   (via the host's `acceptSocket`), serializes typed metadata onto it, and
 *   queues the presence increment — in that order, matching the historical
 *   behavior of both DOs.
 * - **Validated metadata reads.** `read` deserializes the attachment and
 *   runs it through the caller-supplied type guard; malformed or missing
 *   attachments yield `null`, never a partially-typed object.
 * - **Sequence-numbered sends.** `send` wraps every message in
 *   `encodeServerWireFrame` (`protocolVersion`/`sequence`/`messageId`).
 * - **Idempotent release.** `release` performs the
 *   flip-`presenceCounted`-then-decrement dance exactly once per socket, no
 *   matter how many times it is called or from which handler
 *   (`webSocketClose`, `webSocketError`, or both).
 *
 * ## Hibernation invariants
 *
 * - **Attachments are the durable per-socket state.** Everything that must
 *   survive hibernation — the metadata and the `presenceCounted` flag —
 *   lives in `serializeAttachment`/`deserializeAttachment`, never in
 *   in-memory maps. `release` re-reads the flag from the attachment, so its
 *   exactly-once guarantee holds even across a hibernation wake (a fresh
 *   lifecycle instance still sees `presenceCounted: false`).
 * - **Sequence numbers are in-memory and per-socket.** They restart at 1
 *   after a hibernation wake (the WeakMap is rebuilt with the DO instance).
 *   This is intentional and matches the pre-module semantics — clients treat
 *   the sequence as per-connection-epoch, not globally monotonic.
 */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Raw durable attachments are validated by the per-DO schema before use.
type AttachmentFields = Record<string, unknown>

const WS_READY_STATE_OPEN = 1

/**
 * Minimal structural surface of a hibernatable WebSocket. Cloudflare's
 * `WebSocket` satisfies it; tests use plain fake objects (no Miniflare).
 */
export type ConnectionSocket = {
	readyState: number
	send: (data: string) => void
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare structured-clone input contract.
	serializeAttachment: (value: unknown) => void
	// oxlint-disable-next-line anti-slop/no-unknown-returns -- Cloudflare returns untrusted attachments; read validates before exposing metadata.
	deserializeAttachment: () => unknown
}

/**
 * Metadata is generic per DO (the Match and Matchmaker attachments have
 * different shapes). `presenceCounted` is reserved — the module owns that
 * flag and the `?: never` constraint keeps callers from smuggling it in.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Generic durable metadata is decoded before application use.
export type ConnectionMetadata = AttachmentFields & {
	presenceCounted?: never
}

export type ReleaseOutcome<M> =
	| { released: true; metadata: M }
	| { released: false; metadata: M | null }

export type ConnectionLifecycle<M, WS extends ConnectionSocket> = {
	/** Accept the socket for hibernation, attach metadata, count presence. */
	accept: (ws: WS, metadata: M, tags?: string[]) => void
	/** Validated metadata read; `null` for missing/malformed attachments. */
	read: (ws: WS) => M | null
	/** Sequence-numbered send through `encodeServerWireFrame`. No-op unless open. */
	send: (ws: WS, msg: ServerMessage) => void
	/**
	 * Idempotent-by-construction release. The first call flips
	 * `presenceCounted` on the durable attachment and then queues exactly one
	 * presence decrement; every later call (from `webSocketClose`,
	 * `webSocketError`, or a replay after hibernation wake) returns
	 * `released: false`. Callers run their disconnect logic only when
	 * `released` is `true`, which makes double-release structurally impossible.
	 */
	release: (ws: WS) => ReleaseOutcome<M>
}

export type ConnectionLifecycleDeps<
	M extends ConnectionMetadata,
	WS extends ConnectionSocket
> = {
	/** Per-DO attachment guard — rejects malformed attachments. */
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This decoder validates the raw durable attachment.
	isMetadata: (value: AttachmentFields) => value is M
	/** Registers the socket for hibernation (`ctx.acceptWebSocket`). */
	acceptSocket: (ws: WS, tags?: string[]) => void
	/** Queues +1 on the presence counter (e.g. `presenceIncrement`). */
	presenceIncrement: () => void
	/** Queues -1 on the presence counter (e.g. `presenceDecrement`). */
	presenceDecrement: () => void
}

function isRecord(value: unknown): value is AttachmentFields {
	return Predicate.isObject(value)
}

export function createConnectionLifecycle<
	M extends ConnectionMetadata,
	WS extends ConnectionSocket
>(deps: ConnectionLifecycleDeps<M, WS>): ConnectionLifecycle<M, WS> {
	// In-memory by design: rebuilt (sequences restart at 1) on hibernation
	// wake. Never put anything here that must survive hibernation — that
	// belongs on the attachment.
	const sequences = new WeakMap<WS, number>()

	const readAttachmentRecord = (ws: WS): AttachmentFields | null => {
		const attachment = ws.deserializeAttachment()
		return isRecord(attachment) ? attachment : null
	}

	return {
		accept: (ws, metadata, tags) => {
			deps.acceptSocket(ws, tags)
			ws.serializeAttachment({ ...metadata, presenceCounted: true })
			deps.presenceIncrement()
		},

		read: (ws) => {
			const record = readAttachmentRecord(ws)
			if (record === null || !deps.isMetadata(record)) {
				return null
			}
			return record
		},

		send: (ws, msg) => {
			if (ws.readyState !== WS_READY_STATE_OPEN) {
				return
			}
			const sequence = (sequences.get(ws) ?? 0) + 1
			sequences.set(ws, sequence)
			ws.send(
				encodeServerWireFrame({
					sequence,
					messageId: `server-${sequence}`,
					message: msg
				})
			)
		},

		release: (ws) => {
			const record = readAttachmentRecord(ws)
			if (record === null) {
				return { released: false, metadata: null }
			}
			const presenceCounted = record.presenceCounted === true
			if (!deps.isMetadata(record)) {
				return { released: false, metadata: null }
			}
			if (!presenceCounted) {
				return { released: false, metadata: record }
			}
			// Flip the durable flag BEFORE queueing the async decrement so a
			// re-entrant release (close + error for the same socket) observes
			// `presenceCounted: false` and short-circuits.
			ws.serializeAttachment({ ...record, presenceCounted: false })
			deps.presenceDecrement()
			return { released: true, metadata: record }
		}
	}
}

// --- Per-DO metadata shapes ------------------------------------------------

/** Durable per-socket metadata for the `Match` DO. */
export type MatchConnectionMetadata = {
	playerId: string
	username: string
	tribe: Tribe
}

export const isMatchConnectionMetadata = Schema.is(
	Schema.Struct({
		playerId: Schema.String,
		username: Schema.String,
		tribe: Schema.Literals(tribes)
	})
)

/** Durable per-socket metadata for the `Matchmaker` DO. */
export type MatchmakerConnectionMetadata = {
	playerId: string
	username: string
	lobbyId: string
}

export const isMatchmakerConnectionMetadata = Schema.is(
	Schema.Struct({
		playerId: Schema.String,
		username: Schema.String,
		lobbyId: Schema.String
	})
)
