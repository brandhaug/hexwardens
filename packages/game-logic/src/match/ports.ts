import { type Result, Schema } from 'effect'
import { type Intent } from '../dispatch'
import { type Tribe } from '../domains/tribe'
import {
	type ClientMessage,
	type MatchResult,
	type ServerMessage
} from '../multiplayer/types'
import { type ChronicleEntry } from './chronicle/chronicle-entry'
import { type CodecError } from './codec'
import { type MatchCommand, type MatchState } from './types'

/** First-class persistence failure — the DO decides whether to recover. */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
	'PersistenceError',
	{
		message: Schema.String,
		operation: Schema.Literals(['saveState', 'deleteState', 'saveMatchResult']),
		cause: Schema.optional(Schema.Unknown)
	}
) {}

/** Durable state I/O. All writes are fallible and return a Result. */
export interface MatchPersistence {
	loadState(): MatchState | null
	/** Resolves only after the adapter's local durable transaction commits. */
	saveState(
		state: MatchState
	):
		| Result.Result<void, PersistenceError>
		| Promise<Result.Result<void, PersistenceError>>
	deleteState(): Result.Result<void, PersistenceError>
	saveMatchResult(
		result: MatchResult
	): Promise<Result.Result<void, PersistenceError>>
}

/** Named scheduler: the DO maps this onto its alarm primitive. */
export interface MatchScheduler {
	/** Wake the match at `time` (ms epoch). Replaces any pending wake-up. */
	scheduleAt(time: number): void
	/** Clear any pending wake-up. */
	cancel(): void
}

/** Injectable time source — lets tests run on simulated clocks. */
export interface MatchClock {
	now(): number
}

/** WebSocket fan-out: the adapter knows which sockets back which tribe. */
export interface MatchBroadcast {
	sendToTribe(tribe: Tribe, msg: ServerMessage): void
	broadcastAll(msg: ServerMessage): void
	connectedTribes(): Tribe[]
}

/** Client wire decoder with validation. Server framing lives in adapters. */
export interface MatchCodec {
	decode(raw: string): Result.Result<ClientMessage, CodecError>
}

export type MatchLogValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly MatchLogValue[]
	| { readonly [key: string]: MatchLogValue }
export type MatchLogData = Record<string, MatchLogValue>
export type MatchLog = (event: string, data?: MatchLogData) => void

/**
 * Typed lifecycle facts emitted by the match state machine. These describe
 * *what happened* in domain terms — unlike {@link MatchEffect}, they carry no
 * runtime instructions and are safe to publish to tests, UI, telemetry, etc.
 *
 * Payloads carry only already-public facts (tribe, turn, Intent, message).
 * No `MatchState`, no `GameState`, no internal `TurnSchedule`.
 */
export type MatchLifecycleEvent =
	| { t: 'turnAdvanced'; turn: number; tribe: Tribe; isBot: boolean }
	| { t: 'actionPerformed'; tribe: Tribe; intent: Intent; message: string }
	| { t: 'botTurnStarted'; tribe: Tribe; turn: number }
	| {
			t: 'botTurnCompleted'
			tribe: Tribe
			turn: number
			actionCount: number
	  }
	| { t: 'botTurnFailed'; tribe: Tribe; turn: number; reason: string }
	| { t: 'gameOver'; winner: Tribe | null; turn: number }
	| {
			t: 'commandRejected'
			tribe: Tribe
			kind: MatchCommand['kind']
			reason: string
	  }
	/**
	 * Structured chronicle entries derived from gameplay. Emitted alongside
	 * the matching `actionPerformed` (combat-derived entries) or the turn
	 * pipeline's broadcast events (turn-rotation, research, capture, …). The
	 * payload is already deterministic and unfiltered — viewers fog-filter
	 * it via {@link filterEntriesForViewer} before display.
	 */
	| { t: 'chronicleEntries'; entries: readonly ChronicleEntry[] }

/**
 * Optional sibling to {@link MatchBroadcast} / {@link MatchPersistence}:
 * receives typed lifecycle events *after* the matching effects have been
 * interpreted. Tests use this to replace `getState()` polling; the host
 * forwards events to its wide-event log.
 */
export interface MatchObserver {
	onLifecycle(event: MatchLifecycleEvent): void
}
