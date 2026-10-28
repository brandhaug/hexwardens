import { Effect, Result } from 'effect'
import { restoreMatchState } from './checkpoint'
import { immediatePacer, type BotPacer } from '../bot/bot-pacer'
import { runBotTurn, type BotTurnRun } from '../bot/bot-turn'
import { GameHex } from '../board/hex-utils'
import { type Difficulty } from '../difficulty'
import { type GameState } from '../game'
import { type Tribe } from '../domains/tribe'
import {
	type ClientMessage,
	type MatchConfig,
	type MatchResult,
	type ServerMessage
} from '../multiplayer/types'
import {
	type MatchPublisher,
	type RunMatchCommandResult,
	publishMatchTransition
} from './host'

import { createInitialMatchState } from './init'
import {
	decodeClientMessage as decodeRawClientMessage,
	routeClientMessage
} from './client-message-router'
import {
	type MatchBroadcast,
	type MatchClock,
	type MatchCodec,
	type MatchLog,
	type MatchLifecycleEvent,
	type MatchObserver,
	type MatchPersistence,
	type MatchScheduler,
	PersistenceError
} from './ports'
import { computeAlarm, step } from './step'
import {
	type MatchCommand,
	type MatchState,
	type PumpOptions,
	type PumpResult
} from './types'
import { blockedReasonFor, pickDueCommand } from './pump'
import {
	fogProjectionFailureLogData,
	projectStateForTribes
} from './state-projection'
import {
	buildGameStateMessage as projectGameStateMessage,
	type GameStateMessage
} from './view-projection'

export type InitResult =
	| { ok: true; matchId: string; status?: 'already_initialized' }
	| { ok: false; error: string }

// Upper bound on consecutive bot turns drained per alarm firing. Re-arming
// for `{ kind: 'bot', deadline: now }` after each turn means the DO will wake
// again immediately — we drain in batches to keep a single alarm callback
// responsive and bounded while still making progress on long bot chains.
const MAX_BOT_TURNS_PER_ALARM = 50

export interface MatchLogic {
	/** Release this host instance without deleting its durable match. */
	dispose(): void
	/** Current committed state (null until initialization commits). */
	getState(): MatchState | null
	/**
	 * One-time setup called by the matchmaker via RPC. The caller supplies
	 * {@link matchId} (typically the initializer's idempotency key) so that
	 * replayed RPCs against the same Durable Object land on the same match.
	 */
	init(config: MatchConfig, matchId: string): Promise<InitResult>
	/** Build the per-tribe filtered snapshot sent on connect. */
	snapshotFor(tribe: Tribe): GameStateMessage | null
	/** Route a parsed client message from a given tribe. */
	onClientMessage(tribe: Tribe, msg: ClientMessage): Promise<boolean>
	/** Route an opaque wire payload — validates via codec first. */
	onRawMessage(
		tribe: Tribe,
		raw: string,
		onDecodeError: (msg: ServerMessage) => void
	): Promise<void>
	/** Run connection lifecycle commands. */
	onConnectionOpened(playerId: string): Promise<boolean>
	onPlayerReconnected(playerId: string): Promise<boolean>
	onPlayerDisconnected(
		playerId: string,
		tribe: Tribe,
		username: string
	): Promise<void>
	/**
	 * Timer fired — run all due deadlines in one pass.
	 *
	 * Returns a promise because bot turns are async (the interpreter awaits
	 * `runBotTurn` and dispatches `botTurnResolved` inline). Callers that
	 * need to observe state after the alarm finishes must await this.
	 */
	onAlarm(): Promise<void>
	/**
	 * Drive the match forward through any self-scheduled work (disconnect
	 * grace → forfeit, human-turn timeout, bot-turn chain, cleanup) until it
	 * blocks on external input, a caller-supplied predicate, the `maxSteps`
	 * cap, or game-over. `onAlarm` is a thin wrapper over this.
	 *
	 * Tests use `pump({ until, maxSteps })` to deterministically advance a
	 * match without re-implementing the alarm loop.
	 *
	 * **Concurrency contract:** calls made while a previous `pump` is still
	 * running return that in-flight promise verbatim — the second caller's
	 * `opts` (`until`, `maxSteps`) are discarded. This keeps the interpreter
	 * from double-dispatching `runBotTurn` against the same due deadline.
	 * If you need an independent pump with its own stop condition, await
	 * the in-flight one first.
	 */
	pump(opts?: PumpOptions): Promise<PumpResult>
}

export type MatchLogicDeps = {
	persistence: MatchPersistence
	broadcast: MatchBroadcast
	scheduler: MatchScheduler
	clock?: MatchClock
	codec: MatchCodec
	log?: MatchLog
	/** Called when a persistence write fails so the adapter can react. */
	onPersistenceError?: (error: PersistenceError) => void
	/**
	 * Optional observer — receives typed lifecycle events (turn advanced,
	 * bot turn completed, game over, ...) after effects have been interpreted.
	 * Defaults to a no-op, so hosts that don't care pay nothing.
	 */
	observer?: MatchObserver
	/**
	 * Pacing between bot actions. Defaults to {@link immediatePacer} (fires as
	 * fast as the microtask queue drains) so the server/tests stay snappy. The
	 * offline UI injects a {@link delayPacer} so bot turns remain watchable.
	 */
	botPacer?: BotPacer
}

const NOOP_OBSERVER: MatchObserver = {
	onLifecycle: () => {
		/* This optional observer has no subscriber. */
	}
}

export function createMatchLogic(deps: MatchLogicDeps): MatchLogic {
	const { persistence, broadcast, scheduler, codec } = deps
	const log: MatchLog =
		deps.log ??
		(() => {
			/* This optional observer has no subscriber. */
		})
	const clock: MatchClock = deps.clock ?? { now: () => Date.now() }
	const onPersistenceError =
		deps.onPersistenceError ??
		(() => {
			/* This optional observer has no subscriber. */
		})
	const observer: MatchObserver = deps.observer ?? NOOP_OBSERVER
	const botPacer: BotPacer = deps.botPacer ?? immediatePacer

	const loaded = persistence.loadState()
	let state: MatchState | null = loaded ? restoreMatchState(loaded) : null
	// Reentrancy guard: `pump` drives commands through `dispatchCommand`,
	// which awaits async effects (`awaitBotTurn`). A second `pump` started
	// via `onClientMessage` or `onAlarm` while the first is still awaiting
	// would race and double-fire `runBotTurn`. The guard makes recursive
	// pumps no-op — callers get the result of the in-flight pump instead.
	let pumpInFlight: Promise<PumpResult> | null = null
	let commitQueue = Promise.resolve()
	let initialization: Promise<InitResult> | null = null
	let persistenceFailed = false
	let persistenceRetryCount = 0
	let disposed = false
	let botController: AbortController | null = null
	// Transport events cannot be retried by a player. Keep their original order
	// and timestamps; the host awaits receipt until an alarm or command commits them.
	const pendingDisconnects: {
		command: MatchCommand
		now: number
		resolve: () => void
	}[] = []

	function reportPersistenceError(error: PersistenceError): void {
		log('persistence_error', {
			operation: error.operation,
			// oxlint-disable-next-line hexwardens/no-unknown-error-message -- PersistenceError owns this validated diagnostic field
			message: error.message
		})
		onPersistenceError(error)
	}

	function schedulePersistenceRetry(): void {
		if (disposed) {
			return
		}
		const delay = Math.min(1000 * 2 ** persistenceRetryCount, 30_000)
		persistenceRetryCount = Math.min(persistenceRetryCount + 1, 5)
		scheduler.scheduleAt(clock.now() + delay)
	}

	function armScheduler(): void {
		if (!state) {
			scheduler.cancel()
			return
		}
		const at = computeAlarm(state)
		if (at === null) {
			scheduler.cancel()
		} else {
			scheduler.scheduleAt(at)
		}
	}

	function destroyMatch(): void {
		// Keep the terminal checkpoint until storage deletion succeeds.
		const result = persistence.deleteState()
		if (Result.isFailure(result)) {
			persistenceFailed = true
			reportPersistenceError(result.failure)
			schedulePersistenceRetry()
			return
		}
		state = null
		botController?.abort()
		scheduler.cancel()
	}

	function buildGameStateMessage(
		matchState: MatchState,
		tribe: Tribe
	): GameStateMessage | null {
		const projected = projectGameStateMessage(matchState, tribe)
		if (Result.isFailure(projected)) {
			log(
				'fog_projection_failed',
				fogProjectionFailureLogData(tribe, projected.failure)
			)
			return null
		}
		return projected.success
	}

	// Fan-out policy for `stateChanged`: the pure per-Tribe projection lives
	// in `state-projection.ts`; this adapter only logs failures and ships
	// successes. A failed Tribe is skipped (it just misses this update);
	// the other Tribes still receive theirs.
	function projectStateToConnected(matchState: MatchState): void {
		const projections = projectStateForTribes(
			matchState,
			broadcast.connectedTribes()
		)
		for (const projection of projections) {
			if (!projection.ok) {
				log(
					'fog_projection_failed',
					fogProjectionFailureLogData(projection.tribe, projection.error)
				)
				continue
			}
			broadcast.sendToTribe(projection.tribe, projection.message)
		}
	}

	/**
	 * `MatchPublisher` adapter for injected runtime ports. Adding a new
	 * {@link MatchEffect} variant requires a new method here AND a matching
	 * `runMatchCommand` case — TS will refuse to compile otherwise.
	 *
	 * Owns:
	 * - Bot cancellation / staleness handling — `scheduleBotTurn` owns an
	 *   abort controller and rejects cancelled resolutions, then
	 *   re-enters `dispatchCommand` with the *current* `state` closure (so
	 *   bot resolutions land against the freshest match state).
	 * - Fog projection (`projectStateToConnected`) for `stateChanged` so the
	 *   offline + DO hosts share one path.
	 */
	const host: MatchPublisher = {
		projectState(next) {
			projectStateToConnected(next)
		},
		sendToTribe(tribe, msg) {
			broadcast.sendToTribe(tribe, msg)
		},
		broadcastAll(msg) {
			broadcast.broadcastAll(msg)
		},
		async endGame(result: MatchResult) {
			broadcast.broadcastAll({ type: 'gameEnd', result })
			const r = await persistence.saveMatchResult(result)
			if (Result.isFailure(r)) {
				reportPersistenceError(r.failure)
			}
		},
		destroyMatch() {
			destroyMatch()
		},
		log(event, data) {
			log(event, data)
		},
		async scheduleBotTurn(
			tribe: Tribe,
			difficulty: Difficulty,
			gameState: GameState
		): Promise<void> {
			if (botController) {
				return
			}
			const controller = new AbortController()
			botController = controller
			const capturedTurn = gameState.turn
			let run: BotTurnRun
			try {
				run = await runBotTurn(gameState, tribe, difficulty, GameHex, {
					pacer: botPacer,
					signal: controller.signal
				})
			} catch {
				observer.onLifecycle({
					t: 'botTurnFailed',
					tribe,
					turn: capturedTurn,
					reason: controller.signal.aborted
						? 'cancelled'
						: 'bot_execution_failed'
				})
				return
			} finally {
				if (botController === controller) {
					botController = null
				}
			}
			if (disposed || controller.signal.aborted) {
				log('bot_turn_stale', {
					tribe
				})
				observer.onLifecycle({
					t: 'botTurnFailed',
					tribe,
					turn: capturedTurn,
					reason: 'cancelled'
				})
				return
			}
			// Re-enter the dispatch loop with the *current* state closure —
			// not the captured `gameState` from when the bot started — so
			// concurrent state mutations (e.g. a client message that landed
			// during the bot's compute window) are preserved on resolve.
			await dispatchCommand({
				kind: 'botTurnResolved',
				tribe,
				run,
				baseGameState: gameState
			})
		},
		emitLifecycle(event: MatchLifecycleEvent) {
			observer.onLifecycle(event)
		}
	}

	/**
	 * Every adapter exposes one local commit operation. Only its successful
	 * completion replaces the committed projection and rearms the scheduler.
	 */
	async function commitState(next: MatchState): Promise<boolean> {
		const attempted = await Effect.runPromise(
			Effect.tryPromise({
				try: async () => persistence.saveState(next),
				catch: (cause) =>
					new PersistenceError({
						operation: 'saveState',
						message: 'Local match transaction failed',
						cause
					})
			}).pipe(Effect.result)
		)
		const saved = Result.flatMap(attempted, (result) => result)
		if (Result.isFailure(saved)) {
			reportPersistenceError(saved.failure)
			return false
		}
		if (disposed) {
			return false
		}
		state = next
		armScheduler()
		return true
	}

	async function applyCommand(
		cmd: MatchCommand,
		now = clock.now()
	): Promise<RunMatchCommandResult> {
		if (!state) {
			throw new Error('Match is not initialized')
		}
		persistenceFailed = false
		const before = state
		const candidate =
			cmd.kind === 'runBotTurn' && !botController
				? step(before, { kind: 'hostResumed' }, now).nextState
				: before
		const transition = step(candidate, cmd, now)
		if (
			cmd.kind === 'connectionOpened' &&
			transition.nextState.connectionCount !== before.connectionCount + 1
		) {
			return { state: before, pendingBotTurns: [], committed: false }
		}
		function discardFailedCandidate(): RunMatchCommandResult {
			persistenceFailed = true
			schedulePersistenceRetry()
			if (cmd.kind === 'botTurnResolved') {
				observer.onLifecycle({
					t: 'botTurnFailed',
					tribe: cmd.tribe,
					turn: before.gameState.turn,
					reason: 'persistence_failed'
				})
			}
			return { state: before, pendingBotTurns: [], committed: false }
		}
		if (transition.nextState !== before) {
			if (!(await commitState(transition.nextState))) {
				return discardFailedCandidate()
			}
			persistenceFailed = false
			if (cmd.kind !== 'runBotTurn') {
				persistenceRetryCount = 0
			}
		}
		// Disposal can run after commitState resolves but before this continuation.
		if (disposed) {
			return {
				state: transition.nextState,
				pendingBotTurns: [],
				committed: false
			}
		}
		return publishMatchTransition(transition, host)
	}

	async function prepareCommand(
		cmd?: MatchCommand,
		expectedState?: MatchState
	): Promise<RunMatchCommandResult> {
		const pending = pendingDisconnects[0]
		if (!pending) {
			// A queued alarm belongs to the checkpoint that selected it. A commit
			// or recovered disconnect invalidates it; the pump selects again.
			if (cmd && (!expectedState || state === expectedState)) {
				return applyCommand(cmd)
			}
			if (!state) {
				throw new Error('Match is not initialized')
			}
			return { state, pendingBotTurns: [], committed: true }
		}
		const committed = await applyCommand(pending.command, pending.now)
		if (!committed.committed) {
			return committed
		}
		pendingDisconnects.shift()
		pending.resolve()
		return prepareCommand(cmd, expectedState)
	}

	function dispatchCommand(
		cmd?: MatchCommand,
		expectedState?: MatchState
	): Promise<boolean> {
		if (!state || disposed) {
			return Promise.resolve(false)
		}
		const committed = commitQueue.then(() => {
			if (!state || disposed) {
				return null
			}
			return prepareCommand(cmd, expectedState)
		})
		commitQueue = committed.then(
			() => undefined,
			() => undefined
		)
		// Bot resolution re-enters the queue; never await it inside the commit lock.
		return committed.then(async (result) => {
			await Promise.all(result?.pendingBotTurns ?? [])
			return result?.committed ?? false
		})
	}

	return {
		dispose() {
			disposed = true
			botController?.abort()
			scheduler.cancel()
			for (const pending of pendingDisconnects.splice(0)) {
				pending.resolve()
			}
		},
		getState: () => state,

		init(config: MatchConfig, matchId: string): Promise<InitResult> {
			if (disposed) {
				return Promise.resolve({ ok: false, error: 'Match host disposed' })
			}
			if (initialization) {
				return initialization
			}
			if (state) {
				// Resumed offline matches start with `state` already populated
				// from the saved snapshot. Without this `armScheduler()` the bot
				// turn never fires on resume because the constructor's normal
				// init path was skipped. `scheduler.scheduleAt(t)` clears any
				// prior timer, so repeated `init` calls are safe.
				armScheduler()
				return Promise.resolve({
					ok: true,
					status: 'already_initialized',
					matchId: state.matchId
				})
			}
			const initialResult = createInitialMatchState(
				matchId,
				config,
				clock.now()
			)
			if (Result.isFailure(initialResult)) {
				return Promise.resolve({
					ok: false,
					error: initialResult.failure.message
				})
			}
			const initial = initialResult.success
			initialization = commitState(initial)
				.then((committed): InitResult => {
					if (disposed) {
						return {
							ok: false,
							error: 'Match host disposed during initialization'
						}
					}
					if (!committed) {
						return { ok: false, error: 'Could not persist initial match' }
					}
					log('game_initialized', {
						game: { players: config.players.length, mapSize: config.mapSize }
					})
					if (initial.turnSchedule?.kind === 'human') {
						broadcast.broadcastAll({
							type: 'turnTimerUpdate',
							turnEndsAt: initial.turnSchedule.deadline
						})
					}
					return { ok: true, matchId: initial.matchId }
				})
				.finally(() => {
					initialization = null
				})
			return initialization
		},

		snapshotFor(tribe: Tribe): GameStateMessage | null {
			if (!state) {
				return null
			}
			return buildGameStateMessage(state, tribe)
		},

		onClientMessage(tribe: Tribe, msg: ClientMessage): Promise<boolean> {
			if (!state) {
				return Promise.resolve(false)
			}
			const routed = routeClientMessage(tribe, msg)
			if (routed.kind === 'reply') {
				broadcast.sendToTribe(tribe, routed.message)
				return Promise.resolve(true)
			}
			return dispatchCommand(routed.command).then((committed) => {
				if (!committed && !disposed) {
					// Failure replies are host feedback, never discarded candidate effects.
					broadcast.sendToTribe(tribe, {
						type: 'actionResult',
						success: false,
						message: 'The action could not be saved. Try again.'
					})
				}
				return committed
			})
		},

		async onRawMessage(
			tribe: Tribe,
			raw: string,
			onDecodeError: (msg: ServerMessage) => void
		): Promise<void> {
			const decoded = decodeRawClientMessage(codec, raw)
			if (Result.isFailure(decoded)) {
				onDecodeError(decoded.failure)
				return
			}
			await this.onClientMessage(tribe, decoded.success)
		},

		onConnectionOpened(playerId: string): Promise<boolean> {
			return dispatchCommand({ kind: 'connectionOpened', playerId })
		},

		onPlayerReconnected(playerId: string): Promise<boolean> {
			return dispatchCommand({ kind: 'playerReconnected', playerId })
		},

		onPlayerDisconnected(
			playerId: string,
			tribe: Tribe,
			username: string
		): Promise<void> {
			if (!state || disposed) {
				return Promise.resolve()
			}
			const command: MatchCommand = {
				kind: 'playerDisconnected',
				playerId,
				tribe,
				username
			}
			const committed = new Promise<void>((resolve) => {
				pendingDisconnects.push({ command, now: clock.now(), resolve })
			})
			void dispatchCommand()
			return committed
		},

		async pump(opts: PumpOptions = {}): Promise<PumpResult> {
			// Reentrancy guard: if a pump is already running (started by a
			// prior onClientMessage/onAlarm and currently awaiting a bot
			// turn), return its in-flight promise instead of starting a
			// second loop. This prevents two concurrent pumps from both
			// dispatching `runBotTurn` against the same due bot deadline.
			if (pumpInFlight) {
				return pumpInFlight
			}
			pumpInFlight = runPump(opts).finally(() => {
				pumpInFlight = null
			})
			return pumpInFlight
		},

		async onAlarm(): Promise<void> {
			const r = await this.pump({ maxSteps: MAX_BOT_TURNS_PER_ALARM })
			if (!disposed && r.reason !== 'persistence-failed') {
				// An early retry may have consumed the only alarm before the next deadline.
				armScheduler()
			}
			if (r.reason === 'cap-exhausted') {
				log('bot_turn_cap_hit', {
					limit: MAX_BOT_TURNS_PER_ALARM,
					stepsTaken: r.stepsTaken
				})
			}
		}
	}

	async function runPump(opts: PumpOptions): Promise<PumpResult> {
		// `0` is rejected so callers can't accidentally disable the loop via
		// a falsy override. Anything ≥ 1 is honoured; `undefined` uses the
		// default cap. Keeps the nullish-coalescing above unambiguous.
		if (opts.maxSteps !== undefined && opts.maxSteps < 1) {
			throw new Error('pump: maxSteps must be >= 1')
		}
		const maxSteps = opts.maxSteps ?? MAX_BOT_TURNS_PER_ALARM
		const until = opts.until
		let stepsTaken = 0

		while (stepsTaken < maxSteps) {
			if (disposed) {
				return { reason: 'destroyed', stepsTaken, finalState: state }
			}
			if (!state) {
				return { reason: 'destroyed', stepsTaken, finalState: null }
			}
			if (until?.(state)) {
				return { reason: 'predicate-met', stepsTaken, finalState: state }
			}
			if (
				state.gameState.isGameOver &&
				pendingDisconnects.length === 0 &&
				!pickDueCommand(state, clock.now())
			) {
				return { reason: 'game-over', stepsTaken, finalState: state }
			}

			const pending = pendingDisconnects[0]
			const expectedState = state
			const next = pending ? [undefined] : pickDueCommand(state, clock.now())
			if (!next) {
				// Nothing due. Distinguish "waiting on human input" (future
				// human-turn deadline or disconnect grace) from "truly idle"
				// (no scheduled wake at all). Bot-turn deadlines are always
				// due when we reach this branch, so anything remaining is
				// external-input-gated.
				return {
					reason: blockedReasonFor(state),
					stepsTaken,
					finalState: state
				}
			}

			for (const cmd of next) {
				// oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- commands mutate the same match and must execute in deadline order
				await dispatchCommand(cmd, expectedState)
				if (persistenceFailed) {
					return { reason: 'persistence-failed', stepsTaken, finalState: state }
				}
				stepsTaken++
				if (stepsTaken >= maxSteps) {
					break
				}
			}
		}

		return { reason: 'cap-exhausted', stepsTaken, finalState: state }
	}
}
