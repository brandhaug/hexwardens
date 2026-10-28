import { Result } from 'effect'
import { type BotPacer } from '../bot/bot-pacer'
import { type Tribe } from '../domains/tribe'
import {
	type ClientMessage,
	type MatchConfig,
	type ServerMessage
} from '../multiplayer/types'
import {
	appendChronicleEntries,
	emptyChronicle,
	truncateChronicle,
	type Chronicle
} from './chronicle/chronicle'
import { createCodec } from './codec'
import { createMatchLogic, type InitResult, type MatchLogicDeps } from './logic'
import {
	type MatchBroadcast,
	type MatchClock,
	type MatchLifecycleEvent,
	type MatchObserver,
	type MatchPersistence,
	type MatchScheduler,
	PersistenceError
} from './ports'
import { typedKeys } from '../type-utils'
import { type MatchState } from './types'
import { type GameStateMessage } from './view-projection'

/**
 * Handle returned by {@link createOfflineMatch}. Wraps MatchLogic with optional
 * durable local storage behind a subscription API. Callers subscribe to
 * state changes, send `ClientMessage`s (same wire shape as the online path),
 * and tear down via {@link destroy}.
 */
export type OfflineMatchHandle = {
	/** Resolves after initialization and viewer admission commit. Await before reading state. */
	ready(): Promise<void>
	/** Current committed match state. Available after ready() resolves. */
	getState(): MatchState
	/**
	 * Current accumulated match chronicle (capped at the configured limit).
	 * Updated synchronously before {@link subscribe} listeners fire — so React
	 * snapshots that read both `getState()` and `getChronicle()` in the same
	 * `useSyncExternalStore` callback observe a consistent pair.
	 */
	getChronicle(): Chronicle
	/**
	 * Subscribe to state mutations. Fires synchronously whenever the internal
	 * `MatchLogic` broadcasts a state change. Returns an unsubscribe function.
	 * `useSyncExternalStore` is the intended consumer on the React side.
	 */
	subscribe(listener: () => void): () => void
	/**
	 * Subscribe to outgoing server messages (the same `ServerMessage` shape
	 * the WebSocket path emits). The audio service consumes the
	 * `turnEvents` variant for cue lowering; other listeners can ignore
	 * shapes they don't care about. Listeners fire after the matching
	 * state mutation is committed.
	 */
	subscribeServerMessages(listener: (msg: ServerMessage) => void): () => void
	/** Route a raw `ClientMessage` through the match logic. */
	send(message: ClientMessage): Promise<void>
	/**
	 * Convenience for the common end-turn path. Equivalent to
	 * `send({ type: 'endTurn' })`.
	 */
	endTurn(): Promise<void>
	/**
	 * `true` when the local handle can submit gameplay intents (non-spectator
	 * and the match is not destroyed). Consumers use this to gate UI
	 * callbacks without scattering `playerTribe === null` checks.
	 */
	canAct(): boolean
	/**
	 * Per-tribe filtered snapshot used by the UI to derive its
	 * `FilteredGameState`. Matches the online path where the server calls
	 * `snapshotFor(tribe)` before sending on the WebSocket.
	 */
	snapshotFor(tribe: Tribe): GameStateMessage | null
	/**
	 * Test-only: drain any pending bot chain synchronously. In production React
	 * subscribers observe bot-chain progress asynchronously via the broadcast
	 * listener. Tests use this to reach a steady state in one `await`.
	 */
	drain(opts?: { maxSteps?: number }): Promise<void>
	/** Cancel any pending timer and drop references. Safe to call multiple times. */
	destroy(): void
}

/**
 * Thrown when callers invoke `send` / `endTurn` on a match started in
 * spectator mode (`playerTribe: null`). Spectator handles observe state but
 * cannot submit gameplay intents.
 */
export class SpectatorActionError extends Error {
	constructor() {
		super('Cannot send client messages in spectator mode')
		this.name = 'SpectatorActionError'
	}
}

type CreateOfflineMatchArgs = {
	/** Browser adapters supply an IndexedDB transaction; memory-only hosts omit it. */
	commitLocally?: (state: MatchState) => Promise<void>
	config: MatchConfig
	/** The local human's tribe; `null` runs the match in spectator mode. */
	playerTribe: Tribe | null
	/** Stored MatchState to resume instead of creating a new one. */
	initialState?: MatchState
	/** Defaults to `offline-<rand>`. */
	matchId?: string
	/** Defaults to `Date.now`. */
	now?: () => number
	/** Defaults to `immediatePacer` (no wall-clock delay between bot actions). */
	botPacer?: BotPacer
	/** Optional observer for tests / telemetry. Merged with the default no-op. */
	observer?: MatchObserver
	/**
	 * Cap the rolling chronicle to the most-recent N entries. Older entries
	 * fall off as the match progresses — matches the UI panel's bounded
	 * scrollback and keeps long-running matches from leaking memory. Defaults
	 * to 200, which covers ~30 turns of mixed events on a typical match.
	 */
	chronicleLimit?: number
}

/**
 * Construct a local `MatchLogic` driven by a `setTimeout`-backed
 * scheduler and an identity codec. The returned handle is the single-player
 * mirror of the online `GameClient` — React binds via `useSyncExternalStore`
 * and issues gameplay intents through `send` / `endTurn`, exactly like the
 * WebSocket path does on the online route.
 *
 * Behaviour:
 * - All hosts await ready() before rendering. Browser adapters supply a
 *   durable transaction through the persistence port for every candidate.
 * - After every `onClientMessage` and alarm firing, `pump({ maxSteps: 10_000 })`
 *   is voided off to drain the bot chain to quiescence. Subscribers observe
 *   intermediate states via the broadcast listener.
 * - Spectator mode (`playerTribe: null`) throws {@link SpectatorActionError}
 *   on `send` / `endTurn` — observations still fire for every tribe.
 */
export function createOfflineMatch(
	args: CreateOfflineMatchArgs
): OfflineMatchHandle {
	const now = args.now ?? (() => Date.now())
	const matchId =
		args.initialState?.matchId ?? args.matchId ?? `offline-${cryptoRandom()}`

	// The mounted handle owns one viewer; saved connection counts belong to a prior host.
	let state: MatchState | null = args.initialState
		? { ...args.initialState, connectionCount: 0 }
		: null
	const persistence: MatchPersistence = {
		loadState: () => state,
		async saveState(next) {
			await args.commitLocally?.(next)
			state = next
			return Result.succeed(undefined)
		},
		deleteState: () => {
			state = null
			return Result.succeed(undefined)
		},
		saveMatchResult: () => Promise.resolve(Result.succeed(undefined))
	}

	const listeners = new Set<() => void>()
	const serverMessageListeners = new Set<(msg: ServerMessage) => void>()
	let destroyed = false

	function publishMessage(msg: ServerMessage): void {
		for (const listener of serverMessageListeners) {
			listener(msg)
		}
	}

	// Rolling chronicle accumulator. Driven by the wrapped {@link MatchObserver}
	// — chronicle entries arrive on `lifecycle({ t: 'chronicleEntries' })` and
	// are appended in receive order. Capped at `chronicleLimit` (default 200);
	// older entries fall off so a long match doesn't grow without bound.
	const chronicleLimit = args.chronicleLimit ?? 200
	let chronicle: Chronicle = emptyChronicle
	const userObserver = args.observer
	const observer: MatchObserver = {
		onLifecycle(event: MatchLifecycleEvent) {
			if (event.t === 'chronicleEntries' && event.entries.length > 0) {
				chronicle = truncateChronicle(
					appendChronicleEntries(chronicle, event.entries),
					chronicleLimit
				)
				notify()
			}
			userObserver?.onLifecycle(event)
		}
	}

	// Broadcast port: react subscribers get a coarse "state mutated" signal.
	// Fog-filtering happens client-side via `snapshotFor(tribe)` — identical to
	// the online path where the server also calls `snapshotFor` before the
	// WebSocket send. `connectedTribes` returns every tribe so the match logic
	// commits fog for all of them (the UI picks one). Server-message
	// subscribers (e.g. the audio service) get the unfiltered fan-out so
	// they can act on shapes like `turnEvents` that the React store
	// can't carry through `useSyncExternalStore`.
	const broadcast: MatchBroadcast = {
		sendToTribe: (_tribe, msg) => {
			publishMessage(msg)
			notify()
		},
		broadcastAll: (msg) => {
			publishMessage(msg)
			notify()
		},
		connectedTribes: () => {
			if (!state) {
				return []
			}
			return typedKeys(state.gameState.playerStates)
		}
	}

	// setTimeout-backed scheduler. `scheduleAt(t)` clears any existing timer.
	// The returned handle wraps the opaque setTimeout return value —
	// `setTimeout`'s static type differs between Node and DOM/CF Workers, so
	// we close over it in a cancel closure instead of typing it directly.
	let cancelTimer: (() => void) | null = null
	const scheduler: MatchScheduler = {
		scheduleAt: (time) => {
			if (destroyed) {
				return
			}
			if (cancelTimer !== null) {
				cancelTimer()
			}
			const delay = Math.max(0, time - now())
			const id = setTimeout(() => {
				cancelTimer = null
				if (destroyed) {
					return
				}
				// `onAlarm` wraps `pump({ maxSteps: 50 })` — sufficient to make
				// progress on a bot chain while leaving timer-driven progress
				// to the next armed `scheduleAt` call.
				void logic.onAlarm()
			}, delay)
			cancelTimer = () => clearTimeout(id)
		},
		cancel: () => {
			if (cancelTimer !== null) {
				cancelTimer()
				cancelTimer = null
			}
		}
	}

	const clock: MatchClock = { now }

	function notify(): void {
		for (const listener of listeners) {
			listener()
		}
	}

	const logicDeps: MatchLogicDeps = {
		persistence,
		broadcast,
		scheduler,
		clock,
		codec: createCodec(),
		observer
	}
	if (args.botPacer) {
		logicDeps.botPacer = args.botPacer
	}
	const logic = createMatchLogic(logicDeps)

	const initialized = logic
		.init(args.config, matchId)
		.then(requireInitialized)
		.then(() => logic.onConnectionOpened(matchId))
		.then(requireCommittedViewer)
	// `init` arms the scheduler via `scheduleAt(deadline)` for any initial
	// bot turn / turn timer. The `setTimeout` in our scheduler port fires
	// `onAlarm` which pumps the bot chain. No eager drain here — tests that
	// want synchronous progress use `handle.drain()`.

	function ensurePlayable(): void {
		if (args.playerTribe === null) {
			throw new SpectatorActionError()
		}
	}

	return {
		ready: () => initialized,
		getState(): MatchState {
			const current = logic.getState()
			if (!current) {
				throw new Error('Offline match has no state (destroyed?)')
			}
			return current
		},

		getChronicle(): Chronicle {
			return chronicle
		},

		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		subscribeServerMessages(listener) {
			serverMessageListeners.add(listener)
			return () => {
				serverMessageListeners.delete(listener)
			}
		},

		send(message: ClientMessage) {
			ensurePlayable()
			if (!args.playerTribe) {
				return Promise.resolve()
			}
			return logic
				.onClientMessage(args.playerTribe, message)
				.then(() => undefined)
			// `onClientMessage` mutates state and re-arms the scheduler via
			// `armScheduler`; the setTimeout-backed scheduler then drives the
			// bot chain. No extra pump needed.
		},

		endTurn() {
			ensurePlayable()
			if (!args.playerTribe) {
				return Promise.resolve()
			}
			const msg: ClientMessage = { type: 'endTurn' }
			return logic
				.onClientMessage(args.playerTribe, msg)
				.then(requireCommittedTurn)
		},

		canAct(): boolean {
			return args.playerTribe !== null && !destroyed
		},

		snapshotFor(tribe: Tribe) {
			return logic.snapshotFor(tribe)
		},

		async drain(opts?: { maxSteps?: number }) {
			await logic.pump({ maxSteps: opts?.maxSteps ?? 10_000 })
		},

		destroy() {
			if (destroyed) {
				return
			}
			destroyed = true
			logic.dispose()
			scheduler.cancel()
			listeners.clear()
			serverMessageListeners.clear()
		}
	}
}

function cryptoRandom(): string {
	if (
		typeof crypto !== 'undefined' &&
		// oxlint-disable-next-line anti-slop/no-runtime-typeof -- feature detection must not detach the host method from its receiver
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID()
	}
	throw new Error('crypto.randomUUID is required for offline match ids')
}

function requireInitialized(result: InitResult): void {
	if (!result.ok) {
		throw new Error(`createOfflineMatch failed to init: ${result.error}`)
	}
}

function requireCommittedTurn(committed: boolean): void {
	if (!committed) {
		throw new PersistenceError({
			operation: 'saveState',
			message: 'Could not save the end of this turn locally'
		})
	}
}

function requireCommittedViewer(committed: boolean): void {
	if (!committed) {
		throw new PersistenceError({
			operation: 'saveState',
			message: 'Could not save the offline viewer connection'
		})
	}
}
