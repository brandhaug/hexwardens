import { Predicate, Effect, Layer, Result } from 'effect'
import { DurableObject } from 'cloudflare:workers'
import { layerFromD1 } from '@hexwardens/db/effect'
import { Achievements, AchievementsLive } from './achievements'
import { Daily, DailyLive } from './daily'
import { dailyCompletionsForMatch } from './daily-match-completions'
import { type GameTokenPayload } from '@hexwardens/api'
import { verifyGameToken } from './auth'
import { loadEnvConfig, type EnvConfig } from './config'
import { persistenceRetryPolicy, writeMatchResult } from './match-persistence'
import { presenceDecrement, presenceIncrement } from './presence'
import { type Env, type MatchConfig, type MatchResult } from './types'
import {
	createRequestWideEvent,
	createWideEvent,
	withSpanRecording,
	type SpanSink
} from './wide-event'
import {
	createConnectionLifecycle,
	isMatchConnectionMetadata,
	type ConnectionLifecycle,
	type MatchConnectionMetadata
} from './ws-connection'
import { createWsMessageGate, type WsGateResult } from './ws-message-gate'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { createCodec } from '@hexwardens/game-logic/match/codec'
import {
	createMatchLogic,
	type InitResult,
	type MatchLogic
} from '@hexwardens/game-logic/match/logic'
import {
	PersistenceError,
	type MatchBroadcast,
	type MatchClock,
	type MatchObserver,
	type MatchPersistence,
	type MatchScheduler
} from '@hexwardens/game-logic/match/ports'
import { type MatchState } from '@hexwardens/game-logic/match/types'

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare host failures are unknown and receive fixed diagnostic text.
function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error('Host operation failed')
}

export class Match extends DurableObject<Env> {
	private readonly logic: MatchLogic
	private readonly envConfig: EnvConfig
	private readonly messageGate = createWsMessageGate()
	private readonly connections: ConnectionLifecycle<
		MatchConnectionMetadata,
		WebSocket
	>

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.envConfig = loadEnvConfig(env)
		this.connections = createConnectionLifecycle<
			MatchConnectionMetadata,
			WebSocket
		>({
			isMetadata: isMatchConnectionMetadata,
			acceptSocket: (ws, tags) => this.ctx.acceptWebSocket(ws, tags),
			presenceIncrement: () => presenceIncrement(this.ctx, this.env),
			presenceDecrement: () => presenceDecrement(this.ctx, this.env)
		})
		// `ctx.storage.kv` is synchronous, so logic is fully constructed before
		// any handler can run — no blockConcurrencyWhile, no nullable field.
		const persistedState =
			this.ctx.storage.kv.get<MatchState>('matchState') ?? null
		this.logic = createMatchLogic({
			persistence: this.createPersistence(persistedState),
			broadcast: this.createBroadcast(),
			scheduler: this.createScheduler(),
			clock: this.createClock(),
			codec: createCodec(),
			log: (event, data) => {
				const log = createWideEvent()
				log.set({ match: { id: this.ctx.id.toString() } })
				log.set({ event, ...data })
				log.emit()
			},
			onPersistenceError: (error) => {
				const log = createWideEvent()
				log.set({ match: { id: this.ctx.id.toString() } })
				log.error(error)
				log.set({
					event: 'persistence_failure',
					operation: error.operation
				})
				log.emit()
			},
			observer: this.createObserver()
		})
	}

	/**
	 * Forwards typed lifecycle events to the wide-event log under
	 * `match_lifecycle`. Lifecycle is additive — the existing `log` effect
	 * stays intact for event parity (`turn_advanced`, `game_ended`, etc.);
	 * this stream just exposes the same facts in a strongly-typed form.
	 */
	private createObserver(): MatchObserver {
		const matchId = this.ctx.id.toString()
		return {
			onLifecycle: (event) => {
				const log = createWideEvent()
				log.set({ match: { id: matchId } })
				log.set({ event: 'match_lifecycle', ...event })
				log.emit()
			}
		}
	}

	/**
	 * RPC method — called by Matchmaker to initialize the game. The
	 * `idempotencyKey` is persisted as the match id, so retries against the
	 * same Durable Object return `already_initialized` with that key.
	 */
	init(config: MatchConfig, idempotencyKey: string): Promise<InitResult> {
		return this.logic.init(config, idempotencyKey)
	}

	async fetch(request: Request): Promise<Response> {
		const log = createRequestWideEvent(request)
		const url = new URL(request.url)
		log.set({ match: { id: this.ctx.id.toString() } })

		if (request.headers.get('Upgrade') !== 'websocket') {
			log.set({ event: 'match_ws_rejected', reason: 'not_websocket' })
			log.emit({ status: 400 })
			return new Response('Expected WebSocket', { status: 400 })
		}

		const token = url.searchParams.get('token')
		if (!token) {
			log.set({
				event: 'auth_failed',
				route: 'match_ws',
				reason: 'missing_token'
			})
			log.emit({ status: 401 })
			return new Response('Missing auth token', { status: 401 })
		}

		let payload: GameTokenPayload
		try {
			payload = await Effect.runPromise(
				verifyGameToken(token, this.envConfig.authJwtSecret)
			)
		} catch (error) {
			log.set({
				event: 'auth_failed',
				route: 'match_ws',
				reason: 'invalid_token'
			})
			log.error(toError(error))
			log.emit({ status: 401 })
			return new Response('Invalid auth token', { status: 401 })
		}

		log.set({ player: { id: payload.userId, username: payload.username } })

		const logic = this.logic
		const state = logic.getState()
		if (!state) {
			log.set({ event: 'match_ws_rejected', reason: 'match_not_initialized' })
			log.emit({ status: 400 })
			return new Response('Match not initialized', { status: 400 })
		}

		const tribe = state.playerIdToTribe[payload.userId]
		if (!tribe) {
			log.set({ event: 'match_ws_rejected', reason: 'player_not_in_match' })
			log.emit({ status: 403 })
			return new Response('Player not in this match', { status: 403 })
		}

		if (!(await logic.onConnectionOpened(payload.userId))) {
			log.set({ event: 'match_ws_rejected', reason: 'persistence_failed' })
			log.emit({ status: 503 })
			return new Response('Could not save the connection. Try again.', {
				status: 503
			})
		}

		const pair = new WebSocketPair()
		const [client, server] = [pair[0], pair[1]]

		this.connections.accept(server, {
			playerId: payload.userId,
			username: payload.username,
			tribe
		})

		const snapshot = logic.snapshotFor(tribe)
		if (snapshot) {
			this.connections.send(server, snapshot)
		}

		log.set({ player: { tribe } })
		log.emit({ status: 101 })
		return new Response(null, { status: 101, webSocket: client })
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
		if (!Predicate.isString(data)) {
			return
		}

		const metadata = this.connections.read(ws)
		if (!metadata) {
			return
		}

		const gateResult = this.messageGate.check(ws, data, Date.now())
		if (gateResult.kind !== 'ok') {
			this.handleGatedMessage(ws, metadata, gateResult)
			return
		}

		await this.logic.onRawMessage(metadata.tribe, data, (errMsg) =>
			this.connections.send(ws, errMsg)
		)
	}

	private handleGatedMessage(
		ws: WebSocket,
		metadata: MatchConnectionMetadata,
		gateResult: Exclude<WsGateResult, { kind: 'ok' }>
	) {
		const emitGateEvent = (reason: string) => {
			const log = createWideEvent()
			log.set({
				event: 'match_ws_message_rejected',
				reason,
				match: { id: this.ctx.id.toString() },
				player: {
					id: metadata.playerId,
					username: metadata.username,
					tribe: metadata.tribe
				}
			})
			log.emit()
		}
		switch (gateResult.kind) {
			case 'too-large': {
				emitGateEvent('message_too_large')
				this.connections.send(ws, {
					type: 'error',
					message: 'Message too large'
				})
				return
			}
			case 'rate-limited': {
				if (gateResult.firstOverage) {
					emitGateEvent('rate_limited')
					this.connections.send(ws, {
						type: 'error',
						message: 'Too many messages — slow down'
					})
				}
				return
			}
			case 'abusive': {
				emitGateEvent('rate_abuse_disconnect')
				ws.close(1008, 'Message rate limit exceeded')
				return
			}
		}
	}

	webSocketClose(ws: WebSocket) {
		return this.releaseAndDisconnect(ws)
	}

	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare invokes this host callback with an arbitrary failure.
	webSocketError(ws: WebSocket, error: unknown) {
		const metadata = this.connections.read(ws)
		const log = createWideEvent()
		log.set({ event: 'match_ws_error', match: { id: this.ctx.id.toString() } })
		if (metadata) {
			log.set({
				player: {
					id: metadata.playerId,
					username: metadata.username,
					tribe: metadata.tribe
				}
			})
		}
		if (error instanceof Error) {
			log.error(error)
		}
		log.emit()
		return this.releaseAndDisconnect(ws)
	}

	/**
	 * Single close/error path. `release` is idempotent by construction, so
	 * the disconnect command fires exactly once even when both handlers run
	 * for the same socket.
	 */
	private async releaseAndDisconnect(ws: WebSocket): Promise<void> {
		const outcome = this.connections.release(ws)
		if (!outcome.released) {
			return
		}
		await this.logic.onPlayerDisconnected(
			outcome.metadata.playerId,
			outcome.metadata.tribe,
			outcome.metadata.username
		)
	}

	async alarm() {
		await this.logic.onAlarm()
	}

	// --- Port adapters bound to Cloudflare primitives ---

	private createPersistence(initialState: MatchState | null): MatchPersistence {
		const env = this.env
		const ctx = this.ctx
		let loadedState = initialState
		return {
			loadState: () => loadedState,
			saveState: (state) => {
				try {
					ctx.storage.kv.put('matchState', state)
					loadedState = state
					return Result.succeed(undefined)
				} catch (error) {
					return Result.fail(
						new PersistenceError({
							operation: 'saveState',
							message: 'saveState failed',
							cause: error
						})
					)
				}
			},
			deleteState: () => {
				try {
					ctx.storage.kv.delete('matchState')
					loadedState = null
					return Result.succeed(undefined)
				} catch (error) {
					return Result.fail(
						new PersistenceError({
							operation: 'deleteState',
							message: 'deleteState failed',
							cause: error
						})
					)
				}
			},
			saveMatchResult: async (result) => {
				const outcome = await Effect.runPromise(
					writeMatchResult(result).pipe(
						Effect.retry(persistenceRetryPolicy),
						Effect.provide(layerFromD1(env.DB)),
						Effect.result
					)
				)
				const persistOutcome = Result.match(outcome, {
					onSuccess: () => Result.succeed(undefined),
					onFailure: (err) =>
						Result.fail(
							new PersistenceError({
								operation: 'saveMatchResult',
								message: 'Match result persistence failed',
								cause: err
							})
						)
				})
				// Evaluate & broadcast achievements after the match row lands.
				// Failures here are non-fatal — the match outcome is already
				// persisted; we just log and move on.
				if (Result.isSuccess(persistOutcome)) {
					await this.evaluateAndBroadcastAchievements(result)
					await this.persistDailyCompletions(result)
				}
				return persistOutcome
			}
		}
	}

	/**
	 * Run the achievement evaluator and broadcast `achievementsUnlocked` to
	 * each affected tribe. Best-effort — errors are logged as wide events and
	 * swallowed so a flaky achievement query never undoes a saved match.
	 */
	private async evaluateAndBroadcastAchievements(
		result: MatchResult
	): Promise<void> {
		const state = this.logic.getState()
		const config = state?.config
		if (!config) {
			return
		}

		// Created up front so db spans recorded during the run land on the
		// failure event (still emitted only on failure).
		const log = createWideEvent()
		const dbLayer = layerFromD1(this.env.DB)
		const layer = AchievementsLive.pipe(Layer.provide(dbLayer))
		const program = Effect.gen(function* () {
			const a = yield* Achievements
			return yield* a.evaluateAndPersist({ result, config })
		}).pipe(Effect.provide(layer), Effect.result, withSpanRecording(log))

		const outcome = await Effect.runPromise(program)
		if (Result.isFailure(outcome)) {
			log.set({ match: { id: this.ctx.id.toString() } })
			log.set({ event: 'achievements_eval_failed' })
			log.error(new Error(outcome.failure.message))
			log.emit()
			return
		}

		for (const [tribe, achievementIds] of outcome.success.perTribe) {
			if (achievementIds.length === 0) {
				continue
			}
			for (const ws of this.ctx.getWebSockets()) {
				const metadata = this.connections.read(ws)
				if (metadata?.tribe === tribe) {
					this.connections.send(ws, {
						type: 'achievementsUnlocked',
						tribe,
						achievementIds
					})
				}
			}
		}
	}

	private async persistDailyCompletions(result: MatchResult): Promise<void> {
		const state = this.logic.getState()
		if (!state) {
			return
		}

		const completions = dailyCompletionsForMatch(state, result)
		if (completions.length === 0) {
			return
		}

		// Spans from all completions accumulate in one collector; each failure
		// event gets the full snapshot so retries/latency are visible per line.
		let spanFields: Parameters<SpanSink['set']>[0] = {}
		const spanSink: SpanSink = {
			set: (fields) => {
				spanFields = fields
			}
		}
		const dbLayer = layerFromD1(this.env.DB)
		const layer = DailyLive.pipe(Layer.provide(dbLayer))
		const program = Effect.gen(function* () {
			const daily = yield* Daily
			// Per-completion `Effect.result` isolates one player's DB failure
			// from another's — a flaky upsert can't drop a teammate's row.
			// Concurrency is unbounded because completions count is bounded by
			// the PQ player cap (single-digit).
			return yield* Effect.forEach(
				completions,
				(completion) =>
					daily.upsertCompletion(completion).pipe(
						Effect.retry(persistenceRetryPolicy),
						Effect.result,
						Effect.map((outcome) => ({ completion, outcome }))
					),
				{ concurrency: 'unbounded' }
			)
		}).pipe(Effect.provide(layer), withSpanRecording(spanSink))

		const settled = await Effect.runPromise(program)
		for (const { completion, outcome } of settled) {
			if (Result.isFailure(outcome)) {
				const log = createWideEvent()
				log.set({ match: { id: this.ctx.id.toString() } })
				log.set({ player: { id: completion.userId } })
				log.set({ event: 'daily_completion_persist_failed' })
				log.set(spanFields)
				log.error(new Error(outcome.failure.message))
				log.emit()
			}
		}
	}

	private createScheduler(): MatchScheduler {
		const ctx = this.ctx
		return {
			scheduleAt: (time) => {
				void ctx.storage.setAlarm(time)
			},
			cancel: () => {
				void ctx.storage.deleteAlarm()
			}
		}
	}

	private createClock(): MatchClock {
		return { now: () => Date.now() }
	}

	private createBroadcast(): MatchBroadcast {
		const ctx = this.ctx
		const connections = this.connections
		const matchId = this.ctx.id.toString()
		const emitBroadcast = (
			target: 'tribe' | 'all',
			messageType: string,
			tribe?: Tribe
		) => {
			const log = createWideEvent()
			log.set({ match: { id: matchId } })
			log.set({
				event: 'match_broadcast',
				target,
				messageType
			})
			if (tribe !== undefined) {
				log.set({ tribe })
			}
			log.emit()
		}
		return {
			sendToTribe: (tribe, msg) => {
				emitBroadcast('tribe', msg.type, tribe)
				for (const ws of ctx.getWebSockets()) {
					const metadata = connections.read(ws)
					if (metadata?.tribe === tribe) {
						connections.send(ws, msg)
					}
				}
			},
			broadcastAll: (msg) => {
				emitBroadcast('all', msg.type)
				for (const ws of ctx.getWebSockets()) {
					connections.send(ws, msg)
				}
			},
			connectedTribes: () => {
				const tribes: Tribe[] = []
				const seen = new Set<Tribe>()
				for (const ws of ctx.getWebSockets()) {
					const metadata = connections.read(ws)
					if (metadata && !seen.has(metadata.tribe)) {
						seen.add(metadata.tribe)
						tribes.push(metadata.tribe)
					}
				}
				return tribes
			}
		}
	}
}
