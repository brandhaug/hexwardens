import { Predicate, Effect, type Redacted, Result, Schema } from 'effect'
import { DurableObject } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { type GameTokenPayload } from '@hexwardens/api'
import { verifyGameToken } from './auth'
import { loadEnvConfig, type EnvConfig } from './config'
import { LobbyStore, type LobbyReadiness } from './lobby-store'
import { presenceDecrement, presenceIncrement } from './presence'
import { type Env, type LobbyConfig, type ServerMessage } from './types'
import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { decodeClientMessage } from '@hexwardens/game-logic/multiplayer/codec'
import { type MatchInitializer } from '@hexwardens/game-logic/match/initializer'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { DoMatchInitializer } from './match-initializer'
import {
	createConnectionLifecycle,
	isMatchmakerConnectionMetadata,
	type ConnectionLifecycle,
	type MatchmakerConnectionMetadata
} from './ws-connection'
import { jsonResponse, jsonError } from './ws-utils'
import { createWsMessageGate, type WsGateResult } from './ws-message-gate'
import { createWideEvent } from './wide-event'

/** Working type for handler methods — combines connection metadata with the WebSocket. */
type LobbyConnection = MatchmakerConnectionMetadata & {
	ws: WebSocket
}

type AuthRoute = 'lobby_create' | 'lobby_join' | 'lobby_ws' | 'public_queue'

type StartLobbyOutcome =
	| { status: 'started'; matchId: string }
	| { status: 'not-ready'; message: string }

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare host failures are unknown and receive fixed diagnostic text.
function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error('Host operation failed')
}

/** A join body is a 6-char invite code in a small JSON object — anything
 * bigger is garbage, so reject before parsing. */
const maxJoinBodyBytes = 1024

const decodeJoinBody = Schema.decodeUnknownResult(
	Schema.fromJsonString(Schema.Struct({ inviteCode: Schema.NonEmptyString }))
)

async function readJoinBody(
	request: Request
): Promise<{ inviteCode: string } | null> {
	const contentLength = Number(request.headers.get('Content-Length'))
	if (Number.isFinite(contentLength) && contentLength > maxJoinBodyBytes) {
		return null
	}
	const text = await request.text()
	if (text.length > maxJoinBodyBytes) {
		return null
	}
	const decoded = decodeJoinBody(text)
	return Result.isSuccess(decoded) ? decoded.success : null
}

/** Maps the first blocking reason to the user-facing start-rejection message. */
function startBlockedMessage(readiness: LobbyReadiness): string {
	const reason = readiness.blockingReasons[0]
	if (!reason) {
		return 'Not all players are ready'
	}
	switch (reason.kind) {
		case 'lobby-not-found': {
			return 'Lobby not found'
		}
		case 'not-host': {
			return 'Only the host can start the game'
		}
		case 'players-not-ready': {
			return 'Not all players are ready'
		}
		case 'invalid-config': {
			return 'Lobby config is invalid'
		}
		case 'invalid-state': {
			return `Lobby is in a bad state: ${reason.issues[0] ?? 'validation failed'}`
		}
		default: {
			return assertNever(reason)
		}
	}
}

export class Matchmaker extends DurableObject<Env> {
	private readonly lobbyStore: LobbyStore
	private readonly initializer: MatchInitializer
	private readonly envConfig: EnvConfig
	private readonly messageGate = createWsMessageGate()
	private readonly connections: ConnectionLifecycle<
		MatchmakerConnectionMetadata,
		WebSocket
	>

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.envConfig = loadEnvConfig(env)
		this.lobbyStore = new LobbyStore(drizzle(ctx.storage, { logger: false }))
		this.lobbyStore.migrate()
		this.initializer = new DoMatchInitializer(env)
		this.connections = createConnectionLifecycle<
			MatchmakerConnectionMetadata,
			WebSocket
		>({
			isMetadata: isMatchmakerConnectionMetadata,
			acceptSocket: (ws, tags) => this.ctx.acceptWebSocket(ws, tags),
			presenceIncrement: () => presenceIncrement(this.ctx, this.env),
			presenceDecrement: () => presenceDecrement(this.ctx, this.env)
		})
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === '/lobby/create' && request.method === 'POST') {
			return this.handleCreateLobby(request)
		}

		if (url.pathname === '/lobby/join' && request.method === 'POST') {
			return this.handleJoinLobby(request)
		}

		if (url.pathname === '/lobby/public-queue' && request.method === 'POST') {
			return this.handlePublicQueue(request)
		}

		if (request.headers.get('Upgrade') === 'websocket') {
			return this.handleWebSocket(url)
		}

		return new Response('Not found', { status: 404 })
	}

	private async handleCreateLobby(request: Request): Promise<Response> {
		const auth = await authenticateGameToken(
			extractBearerToken(request),
			this.envConfig.authJwtSecret,
			'lobby_create'
		)
		if ('response' in auth) {
			return auth.response
		}
		const { payload } = auth

		await this.lobbyStore.deleteExpiredLobbies()

		const outcome = await this.lobbyStore.createPrivateLobby({
			playerId: payload.userId,
			username: payload.username
		})

		if (outcome.status === 'limit-reached') {
			const log = createWideEvent()
			log.set({
				event: 'lobby_create_rejected',
				reason: 'host_limit',
				host: { id: payload.userId, username: payload.username }
			})
			log.emit()
			return jsonError('Too many active lobbies — close one first', 429)
		}

		const log = createWideEvent()
		log.set({ lobby: { id: outcome.lobbyId } })
		log.set({
			event: 'lobby_created',
			host: { id: payload.userId, username: payload.username },
			lobby: { inviteCode: outcome.inviteCode }
		})
		log.emit()

		return jsonResponse({
			lobbyId: outcome.lobbyId,
			inviteCode: outcome.inviteCode,
			playerId: payload.userId
		})
	}

	private async handleJoinLobby(request: Request): Promise<Response> {
		const auth = await authenticateGameToken(
			extractBearerToken(request),
			this.envConfig.authJwtSecret,
			'lobby_join'
		)
		if ('response' in auth) {
			return auth.response
		}
		const { payload } = auth

		const body = await readJoinBody(request)
		if (!body) {
			return jsonError('Missing invite code', 400)
		}

		const outcome = await this.lobbyStore.joinByInviteCode(body.inviteCode, {
			playerId: payload.userId,
			username: payload.username
		})

		switch (outcome.status) {
			case 'not-found': {
				return jsonError('Lobby not found', 404)
			}
			case 'invalid-config': {
				return jsonError('Lobby config is invalid', 500)
			}
			case 'full': {
				return jsonError('Lobby is full', 400)
			}
			case 'already-joined': {
				return jsonResponse({
					lobbyId: outcome.lobbyId,
					playerId: payload.userId
				})
			}
			case 'joined': {
				const log = createWideEvent()
				log.set({ lobby: { id: outcome.lobbyId } })
				log.set({
					event: 'player_joined_lobby',
					player: { id: payload.userId, username: payload.username }
				})
				log.emit()

				await this.broadcastLobbyState(outcome.lobbyId)

				return jsonResponse({
					lobbyId: outcome.lobbyId,
					playerId: payload.userId
				})
			}
			default: {
				return assertNever(outcome)
			}
		}
	}

	private async handlePublicQueue(request: Request): Promise<Response> {
		const auth = await authenticateGameToken(
			extractBearerToken(request),
			this.envConfig.authJwtSecret,
			'public_queue'
		)
		if ('response' in auth) {
			return auth.response
		}
		const { payload } = auth

		await this.lobbyStore.deleteExpiredLobbies()

		const entry = await this.lobbyStore.joinPublicQueue({
			playerId: payload.userId,
			username: payload.username
		})

		if (entry.entered === 'existing') {
			await this.broadcastLobbyState(entry.lobbyId)
		} else {
			const log = createWideEvent()
			log.set({
				event: 'public_queue_entered',
				lobby: { id: entry.lobbyId },
				player: { id: payload.userId, username: payload.username }
			})
			log.emit()
		}

		const match =
			entry.playerCount >= entry.config.maxPlayers
				? await this.startLobby(entry.lobbyId)
				: null

		return jsonResponse({
			lobbyId: entry.lobbyId,
			playerId: payload.userId,
			matchId: match?.status === 'started' ? match.matchId : null
		})
	}

	private async handleWebSocket(url: URL): Promise<Response> {
		const auth = await authenticateGameToken(
			url.searchParams.get('token'),
			this.envConfig.authJwtSecret,
			'lobby_ws'
		)
		if ('response' in auth) {
			return auth.response
		}
		const { payload } = auth

		const lobbyId = url.pathname.split('/')[2]
		if (!lobbyId) {
			return jsonError('Missing lobby ID', 400)
		}

		const isMember = await this.lobbyStore.isMember(lobbyId, payload.userId)

		if (!isMember) {
			const log = createWideEvent()
			log.set({
				event: 'lobby_ws_rejected',
				reason: 'not_in_lobby',
				lobby: { id: lobbyId },
				player: { id: payload.userId, username: payload.username }
			})
			log.emit()
			return jsonError('Not in this lobby', 403)
		}

		const pair = new WebSocketPair()
		const [client, server] = [pair[0], pair[1]]

		this.connections.accept(
			server,
			{
				playerId: payload.userId,
				username: payload.username,
				lobbyId
			},
			[`lobby:${lobbyId}`]
		)

		const lobbyState = await this.lobbyStore.getLobbyState(lobbyId)
		if (lobbyState) {
			this.connections.send(server, { type: 'lobbyUpdate', lobby: lobbyState })
		}

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

		const decoded = decodeClientMessage(data)
		if (Result.isFailure(decoded)) {
			this.connections.send(ws, {
				type: 'error',
				message: decoded.failure.message
			})
			return
		}
		const msg = decoded.success

		const conn: LobbyConnection = { ws, ...metadata }

		switch (msg.type) {
			case 'action':
			case 'actionRequest':
			case 'endTurn': {
				return
			}
			case 'setTribe': {
				await this.handleSetTribe(conn, msg.tribe)
				break
			}
			case 'setReady': {
				await this.handleSetReady(conn, msg.ready)
				break
			}
			case 'startGame': {
				this.ctx.waitUntil(
					// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection callback is the host failure boundary.
					this.handleStartGame(conn).catch((error: unknown) => {
						const log = createWideEvent()
						log.set({
							event: 'lobby_start_game_failed',
							lobby: { id: conn.lobbyId },
							player: { id: conn.playerId, username: conn.username }
						})
						log.error(toError(error))
						log.emit()
					})
				)
				break
			}
			case 'configureLobby': {
				await this.handleConfigureLobby(conn, msg.config)
				break
			}
			case 'setSlotBot': {
				await this.handleSetSlotBot(
					conn,
					msg.slotIndex,
					msg.isBot,
					msg.difficulty
				)
				break
			}
		}
	}

	private handleGatedMessage(
		ws: WebSocket,
		metadata: MatchmakerConnectionMetadata,
		gateResult: Exclude<WsGateResult, { kind: 'ok' }>
	) {
		const emitGateEvent = (reason: string) => {
			const log = createWideEvent()
			log.set({
				event: 'lobby_ws_message_rejected',
				reason,
				lobby: { id: metadata.lobbyId },
				player: { id: metadata.playerId, username: metadata.username }
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

	async webSocketClose(ws: WebSocket) {
		// `release` is idempotent by construction — if `webSocketError` already
		// released this socket, `released` is false and the leave logic is
		// skipped, so a close+error pair can never double-decrement or
		// double-leave.
		const outcome = this.connections.release(ws)
		if (outcome.released) {
			await this.handlePlayerLeave(outcome.metadata)
		}
	}

	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare invokes this host callback with an arbitrary failure.
	webSocketError(ws: WebSocket, error: unknown) {
		const outcome = this.connections.release(ws)
		const log = createWideEvent()
		log.set({ event: 'lobby_ws_error' })
		if (outcome.metadata) {
			log.set({
				lobby: { id: outcome.metadata.lobbyId },
				player: {
					id: outcome.metadata.playerId,
					username: outcome.metadata.username
				}
			})
		}
		if (error instanceof Error) {
			log.error(error)
		}
		log.emit()
		if (outcome.released) {
			const metadata = outcome.metadata
			this.ctx.waitUntil(
				// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection is an external failure boundary.
				this.handlePlayerLeave(metadata).catch((leaveError: unknown) => {
					const leaveLog = createWideEvent()
					leaveLog.set({
						event: 'lobby_player_leave_failed',
						lobby: { id: metadata.lobbyId },
						player: { id: metadata.playerId, username: metadata.username }
					})
					leaveLog.error(toError(leaveError))
					leaveLog.emit()
				})
			)
		}
	}

	private async handleSetTribe(conn: LobbyConnection, tribe: Tribe) {
		const result = await this.lobbyStore.setTribe(
			conn.lobbyId,
			conn.playerId,
			tribe
		)

		if (result === 'tribe-taken') {
			this.connections.send(conn.ws, {
				type: 'error',
				message: 'Tribe already taken'
			})
			return
		}

		await this.broadcastLobbyState(conn.lobbyId)
	}

	private async handleSetReady(conn: LobbyConnection, ready: boolean) {
		const result = await this.lobbyStore.setReady(
			conn.lobbyId,
			conn.playerId,
			ready
		)

		if (result === 'tribe-required') {
			this.connections.send(conn.ws, {
				type: 'error',
				message: 'Select a tribe first'
			})
			return
		}

		await this.broadcastLobbyState(conn.lobbyId)
	}

	private async handleStartGame(conn: LobbyConnection) {
		const outcome = await this.startLobby(conn.lobbyId, conn.playerId)
		if (outcome.status === 'not-ready') {
			this.connections.send(conn.ws, {
				type: 'error',
				message: outcome.message
			})
		}
	}

	private async startLobby(
		lobbyId: string,
		expectedHostId?: string
	): Promise<StartLobbyOutcome> {
		const context = await this.lobbyStore.readStartContext(
			lobbyId,
			expectedHostId
		)
		if (context.status === 'blocked') {
			return {
				status: 'not-ready',
				message: startBlockedMessage(context.readiness)
			}
		}
		const { snapshot, idempotencyKey } = context

		const outcome = await this.initializer.startMatch(snapshot, idempotencyKey)

		switch (outcome.status) {
			case 'started':
			case 'already-started': {
				const log = createWideEvent()
				log.set({ lobby: { id: lobbyId } })
				log.set({
					event:
						outcome.status === 'started'
							? 'game_starting'
							: 'game_start_replay',
					match: { id: outcome.matchId },
					game: {
						players: snapshot.slots.length,
						mapSize: snapshot.config.mapSize
					}
				})
				log.emit()

				this.broadcastToLobby(lobbyId, {
					type: 'gameStart',
					matchId: outcome.matchId
				})

				await this.lobbyStore.deleteLobby(lobbyId)

				for (const ws of this.ctx.getWebSockets(`lobby:${lobbyId}`)) {
					ws.close(1000, 'Game started')
				}
				return { status: 'started', matchId: outcome.matchId }
			}
			case 'transient': {
				return {
					status: 'not-ready',
					message: 'Match server is busy — try again in a moment.'
				}
			}
			case 'invalid': {
				const why = outcome.issues[0] ?? 'validation failed'
				return {
					status: 'not-ready',
					message: `Lobby is in a bad state: ${why}`
				}
			}
			case 'permanent': {
				return { status: 'not-ready', message: outcome.reason }
			}
			default: {
				return assertNever(outcome)
			}
		}
	}

	private async handleConfigureLobby(
		conn: LobbyConnection,
		config: Partial<LobbyConfig>
	) {
		const result = await this.lobbyStore.configure(
			conn.lobbyId,
			conn.playerId,
			config
		)

		switch (result) {
			case 'not-host': {
				this.connections.send(conn.ws, {
					type: 'error',
					message: 'Only the host can configure the lobby'
				})
				return
			}
			case 'invalid-config': {
				this.connections.send(conn.ws, {
					type: 'error',
					message: 'Lobby config is invalid'
				})
				return
			}
			case 'ok': {
				await this.broadcastLobbyState(conn.lobbyId)
			}
		}
	}

	private async handleSetSlotBot(
		conn: LobbyConnection,
		slotIndex: number,
		isBot: boolean,
		difficulty?: Difficulty
	) {
		const result = await this.lobbyStore.setSlotBot(
			conn.lobbyId,
			conn.playerId,
			slotIndex,
			isBot,
			difficulty
		)

		switch (result) {
			case 'public-queue': {
				this.connections.send(conn.ws, {
					type: 'error',
					message: 'Public queue does not support bots'
				})
				return
			}
			case 'not-host': {
				this.connections.send(conn.ws, {
					type: 'error',
					message: 'Only the host can manage bots'
				})
				return
			}
			case 'invalid-config': {
				this.connections.send(conn.ws, {
					type: 'error',
					message: 'That bot seat is unavailable for this map'
				})
				return
			}
			case 'no-tribe': {
				this.connections.send(conn.ws, {
					type: 'error',
					message: 'No tribe available for bot'
				})
				return
			}
			case 'ok': {
				await this.broadcastLobbyState(conn.lobbyId)
			}
		}
	}

	private async handlePlayerLeave(metadata: MatchmakerConnectionMetadata) {
		const outcome = await this.lobbyStore.removePlayer(
			metadata.lobbyId,
			metadata.playerId
		)

		if (outcome === 'players-remain') {
			await this.broadcastLobbyState(metadata.lobbyId)
		}
	}

	private async broadcastLobbyState(lobbyId: string) {
		const state = await this.lobbyStore.getLobbyState(lobbyId)
		if (!state) {
			return
		}
		this.broadcastToLobby(lobbyId, { type: 'lobbyUpdate', lobby: state })
	}

	private broadcastToLobby(lobbyId: string, msg: ServerMessage) {
		for (const ws of this.ctx.getWebSockets(`lobby:${lobbyId}`)) {
			this.connections.send(ws, msg)
		}
	}
}

function logAuthFailure(
	route: AuthRoute,
	reason: 'missing_token' | 'invalid_token',
	error?: Error
) {
	const log = createWideEvent()
	log.set({ event: 'auth_failed', route, reason })
	if (error) {
		log.error(error)
	}
	log.emit()
}

function extractBearerToken(request: Request): string | null {
	const auth = request.headers.get('Authorization')
	if (!auth?.startsWith('Bearer ')) {
		return null
	}
	return auth.slice(7)
}

async function authenticateGameToken(
	token: string | null,
	secret: Redacted.Redacted,
	route: AuthRoute
): Promise<{ payload: GameTokenPayload } | { response: Response }> {
	if (!token) {
		logAuthFailure(route, 'missing_token')
		return { response: jsonError('Missing auth token', 401) }
	}

	try {
		const payload = await Effect.runPromise(verifyGameToken(token, secret))
		return { payload }
	} catch (error) {
		logAuthFailure(route, 'invalid_token', toError(error))
		return { response: jsonError('Invalid auth token', 401) }
	}
}
