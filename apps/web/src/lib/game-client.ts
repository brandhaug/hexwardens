import { Effect, Result, Schema } from 'effect'
import {
	FetchHttpClient,
	HttpClient,
	HttpClientError,
	HttpClientRequest,
	HttpClientResponse
} from 'effect/http'
import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	findTribeIsolationLeak,
	type FilteredGameStateIssue
} from '@hexwardens/game-logic/fog-of-war/schema'
import { type GameAction } from '@hexwardens/game-logic/game'
import {
	decodeServerWireFrame,
	encodeClientMessage,
	type WireDecodeError
} from '@hexwardens/game-logic/multiplayer/codec'
import {
	type ClientMessage,
	type LobbyConfig,
	type ServerMessage,
	type WireActionIntent
} from '@hexwardens/game-logic/multiplayer/types'
import { assertNever } from '@hexwardens/game-logic/type-utils'

export type { LobbyState } from '@hexwardens/game-logic/multiplayer/types'

class ApiError extends Schema.TaggedError<ApiError>()('ApiError', {
	status: Schema.Finite,
	message: Schema.String
}) {}

class NetworkError extends Schema.TaggedError<NetworkError>()('NetworkError', {
	message: Schema.String,
	cause: Schema.Unknown
}) {
	static fromCause(cause: unknown): NetworkError {
		return new NetworkError({
			cause,
			message: 'Network request failed'
		})
	}
}

export type LobbyError = ApiError | NetworkError

const CreateLobbyResponseSchema = Schema.Struct({
	lobbyId: Schema.String,
	inviteCode: Schema.String,
	playerId: Schema.String
})
const JoinLobbyResponseSchema = Schema.Struct({
	lobbyId: Schema.String,
	playerId: Schema.String
})
const JoinPublicQueueResponseSchema = Schema.Struct({
	lobbyId: Schema.String,
	playerId: Schema.String,
	matchId: Schema.NullOr(Schema.String)
})
const decodeCreateLobby = HttpClientResponse.schemaBodyJson(
	CreateLobbyResponseSchema
)
const decodeJoinLobby = HttpClientResponse.schemaBodyJson(
	JoinLobbyResponseSchema
)
const decodeJoinPublicQueue = HttpClientResponse.schemaBodyJson(
	JoinPublicQueueResponseSchema
)

const lobbyPost = (
	serverUrl: string,
	path: string,
	token: string,
	body?: unknown
) =>
	Effect.gen(function* () {
		const baseClient = yield* HttpClient.HttpClient
		const client = HttpClient.filterStatusOk(baseClient)
		const request = HttpClientRequest.post(`${serverUrl}${path}`).pipe(
			HttpClientRequest.bearerToken(token),
			HttpClientRequest.acceptJson,
			body === undefined ? (r) => r : HttpClientRequest.bodyJsonUnsafe(body)
		)
		return yield* client.execute(request)
	})

const toLobbyError = (cause: unknown): LobbyError => {
	if (cause instanceof HttpClientError.StatusCodeError) {
		return new ApiError({
			status: cause.response.status,
			message: `Request failed with HTTP ${cause.response.status}`
		})
	}
	return NetworkError.fromCause(cause)
}

/**
 * Single run boundary for lobby HTTP programs: Result-ifies the outcome and
 * provides the fetch-backed HttpClient. The layer is stateless (a thin wrap
 * over `fetch`), so providing it per run costs nothing — what matters is that
 * every lobby call shares one boundary instead of three hand-rolled ones.
 */
const runLobbyProgram = <A, E>(
	program: Effect.Effect<A, E, HttpClient.HttpClient>
): Promise<Result.Result<A, E>> =>
	Effect.runPromise(
		Effect.result(program).pipe(Effect.provide(FetchHttpClient.layer))
	)

const credentialsStorageKey = 'hexwardens-game-credentials'
const decodeGameCredentials = Schema.decodeUnknownResult(
	Schema.fromJsonString(
		Schema.Struct({
			token: Schema.NonEmptyString,
			serverUrl: Schema.NonEmptyString
		})
	)
)
let gameCredentials: { token: string; serverUrl: string } | null = null

export function storeGameCredentials(data: {
	token: string
	serverUrl: string
}) {
	gameCredentials = data
	// Browser WebSocket upgrades already require this short-lived game token
	// in JavaScript. Keep it tab-scoped; never persist the account session.
	Result.try(() => {
		// oxlint-disable-next-line react-doctor/auth-token-in-web-storage -- Cross-origin game WebSockets use a JS bearer token; tab storage preserves guest identity across reloads without persisting account credentials.
		sessionStorage.setItem(credentialsStorageKey, JSON.stringify(data))
	})
}

export function getStoredGameCredentials() {
	if (gameCredentials || typeof window === 'undefined') {
		return gameCredentials
	}
	const stored = Result.try(() => sessionStorage.getItem(credentialsStorageKey))
	if (Result.isSuccess(stored)) {
		const decoded = decodeGameCredentials(stored.success)
		if (Result.isSuccess(decoded)) {
			gameCredentials = decoded.success
		}
	}
	return gameCredentials
}

export async function createLobby(
	serverUrl: string,
	token: string
): Promise<
	Result.Result<
		{ lobbyId: string; inviteCode: string; playerId: string },
		LobbyError
	>
> {
	const program = lobbyPost(serverUrl, '/lobby/create', token).pipe(
		Effect.flatMap(decodeCreateLobby),
		Effect.mapError(toLobbyError)
	)
	return runLobbyProgram(program)
}

export async function joinLobby(
	serverUrl: string,
	token: string,
	inviteCode: string
): Promise<Result.Result<{ lobbyId: string; playerId: string }, LobbyError>> {
	const program = lobbyPost(serverUrl, '/lobby/join', token, {
		inviteCode
	}).pipe(Effect.flatMap(decodeJoinLobby), Effect.mapError(toLobbyError))
	return runLobbyProgram(program)
}

export async function joinPublicQueue(
	serverUrl: string,
	token: string
): Promise<
	Result.Result<
		{ lobbyId: string; playerId: string; matchId: string | null },
		LobbyError
	>
> {
	const program = lobbyPost(serverUrl, '/lobby/public-queue', token).pipe(
		Effect.flatMap(decodeJoinPublicQueue),
		Effect.mapError(toLobbyError)
	)
	return runLobbyProgram(program)
}

/**
 * Minimal WebSocket surface — a subset of the browser `WebSocket` API.
 * Lets us swap in an in-memory adapter for tests.
 */
export type WebSocketLike = {
	readonly readyState: number
	send(data: string): void
	close(): void
	onopen: ((ev: Event) => void) | null
	onmessage: ((ev: MessageEvent<string>) => void) | null
	onclose: ((ev: CloseEvent) => void) | null
	onerror: ((ev: Event) => void) | null
}

export type WebSocketFactory = (url: string) => WebSocketLike

/**
 * Exhaustive handler record. Every `ServerMessage` variant must be handled;
 * the type system enforces it because a missing tag fails the mapped-type check.
 */
export type ServerMessageHandlers = {
	[K in ServerMessage['type']]: (
		msg: Extract<ServerMessage, { type: K }>
	) => void
}

export type GameClientOptions = {
	handlers: ServerMessageHandlers
	/** Unexpected loss of an open socket; intentional disconnect stays quiet. */
	onClose?: () => void
	onDecodeError?: (error: WireDecodeError) => void
	/**
	 * Called when a `gameState` message decodes cleanly but fails tribe-isolation
	 * validation — i.e. the server payload looked structurally valid but leaked
	 * opponent `exploration` or `researchInProgress`. The offending message is
	 * dropped (the handler is not invoked); consumers typically surface a toast
	 * and log so the leaking server can be investigated.
	 */
	onValidationError?: (error: FilteredGameStateIssue) => void
	onStatusChange?: (status: GameConnectionStatus) => void
	webSocketFactory?: WebSocketFactory
}

export type GameConnectionState =
	| 'idle'
	| 'connecting'
	| 'open'
	| 'reconnecting'
	| 'closed'

export type GameConnectionStatus = {
	state: GameConnectionState
	lastMessageAt: number | null
	lastServerSequence: number | null
}

export type GameClient = {
	connectToLobby(serverUrl: string, lobbyId: string, token: string): void
	connectToMatch(serverUrl: string, matchId: string, token: string): void
	reconnect(): void
	isConnected(): boolean
	getStatus(): GameConnectionStatus
	disconnect(): void
	send(msg: ClientMessage): void
	setTribe(tribe: Tribe): void
	setReady(ready: boolean): void
	startGame(): void
	sendAction(action: GameAction): void
	sendActionRequest(action: WireActionIntent): void
	endTurn(): void
	configureLobby(config: Partial<LobbyConfig>): void
	setSlotBot(slotIndex: number, isBot: boolean, difficulty?: Difficulty): void
}

const OPEN_READY_STATE = 1

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url)

/**
 * Reconnect backoff: 500ms doubling to a 30s ceiling, plus 0–250ms jitter so
 * thousands of clients dropped by one server restart don't reconnect in
 * lockstep. After `maxReconnectAttempts` the client gives up and reports
 * `closed`; the manual `reconnect()` resets the budget.
 */
const baseReconnectDelayMs = 500
const maxReconnectDelayMs = 30_000
const reconnectJitterMs = 250
const maxReconnectAttempts = 12

export function createGameClient(options: GameClientOptions): GameClient {
	const factory = options.webSocketFactory ?? defaultFactory
	let ws: WebSocketLike | null = null
	let queued: string[] = []
	let lastUrl: string | null = null
	let reconnectAttempts = 0
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null
	let status: GameConnectionStatus = {
		state: 'idle',
		lastMessageAt: null,
		lastServerSequence: null
	}

	const setStatus = (patch: Partial<GameConnectionStatus>) => {
		status = { ...status, ...patch }
		options.onStatusChange?.(status)
	}

	const clearReconnectTimer = () => {
		if (reconnectTimer !== null) {
			clearTimeout(reconnectTimer)
			reconnectTimer = null
		}
	}

	const scheduleReconnect = () => {
		if (lastUrl === null || reconnectTimer !== null) {
			return
		}
		if (reconnectAttempts >= maxReconnectAttempts) {
			setStatus({ state: 'closed' })
			return
		}
		const delay =
			Math.min(
				maxReconnectDelayMs,
				baseReconnectDelayMs * 2 ** reconnectAttempts
			) +
			Math.random() * reconnectJitterMs
		reconnectAttempts++
		setStatus({ state: 'reconnecting' })
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null
			if (lastUrl !== null) {
				connect(lastUrl, 'reconnecting')
			}
		}, delay)
	}

	const dispatch = (msg: ServerMessage) => {
		// Re-check the tribe-isolation invariant client-side. The wire codec
		// already validates structural shape; this catches the specific leak the
		// codec can't see — opponent `exploration` or `researchInProgress`
		// surviving fog projection. O(tribes × 2 fields) per frame, so cheap
		// enough to run on every state push as a belt-and-braces defense
		// against a compromised or buggy upstream.
		if (msg.type === 'gameState') {
			const leak = findTribeIsolationLeak(msg.state, msg.viewer)
			if (leak !== null) {
				options.onValidationError?.(leak)
				return
			}
		}
		switch (msg.type) {
			case 'lobbyUpdate': {
				options.handlers.lobbyUpdate(msg)
				return
			}
			case 'gameStart': {
				options.handlers.gameStart(msg)
				return
			}
			case 'gameState': {
				options.handlers.gameState(msg)
				return
			}
			case 'actionResult': {
				options.handlers.actionResult(msg)
				return
			}
			case 'playerForfeited': {
				options.handlers.playerForfeited(msg)
				return
			}
			case 'gameEnd': {
				options.handlers.gameEnd(msg)
				return
			}
			case 'error': {
				options.handlers.error(msg)
				return
			}
			case 'turnTimerUpdate': {
				options.handlers.turnTimerUpdate(msg)
				return
			}
			case 'turnEvents': {
				options.handlers.turnEvents(msg)
				return
			}
			case 'chronicleEntries': {
				options.handlers.chronicleEntries(msg)
				return
			}
			case 'achievementsUnlocked': {
				options.handlers.achievementsUnlocked(msg)
				return
			}
			default: {
				assertNever(msg)
			}
		}
	}

	const connect = (url: string, state: GameConnectionState = 'connecting') => {
		clearReconnectTimer()
		if (ws) {
			// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
			ws.onclose = null
			ws.close()
			ws = null
		}
		lastUrl = url
		setStatus({ state })
		const socket = factory(url)
		ws = socket

		// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
		socket.onopen = () => {
			reconnectAttempts = 0
			setStatus({ state: 'open' })
			if (queued.length > 0) {
				const pending = queued
				queued = []
				for (const frame of pending) {
					socket.send(frame)
				}
			}
		}
		// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
		socket.onmessage = (event) => {
			const decoded = decodeServerWireFrame(event.data)
			if (Result.isFailure(decoded)) {
				options.onDecodeError?.(decoded.failure)
				return
			}
			setStatus({
				lastMessageAt: Date.now(),
				lastServerSequence: decoded.success.sequence
			})
			dispatch(decoded.success.message)
		}
		// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
		socket.onclose = () => {
			ws = null
			// Only surface the drop (toast etc.) on the transition out of an
			// open connection — failed retry attempts stay quiet.
			const wasOpen = status.state === 'open'
			if (wasOpen) {
				options.onClose?.()
			}
			scheduleReconnect()
		}
	}

	const disconnect = () => {
		clearReconnectTimer()
		if (ws) {
			// Detach handlers before close so a late `onclose` from this socket
			// (which fires async after `close()` on a still-CONNECTING WS) cannot
			// stomp the status of a freshly-created replacement client that
			// shares the same `onStatusChange` / `onClose` callbacks.
			// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
			ws.onopen = null
			// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
			ws.onmessage = null
			// oxlint-disable-next-line unicorn/prefer-add-event-listener -- WebSocketLike is a callback-slot port; detaching its handlers prevents stale close events from changing the replacement connection.
			ws.onclose = null
			ws.close()
			ws = null
		}
		queued = []
		lastUrl = null
		setStatus({ state: 'closed' })
	}

	const send = (msg: ClientMessage) => {
		const frame = encodeClientMessage(msg)
		if (ws?.readyState === OPEN_READY_STATE) {
			ws.send(frame)
		} else if (ws) {
			queued.push(frame)
		}
	}

	return {
		connectToLobby(serverUrl, lobbyId, token) {
			const wsUrl = serverUrl.replace(/^http/, 'ws')
			connect(`${wsUrl}/lobby/${lobbyId}?token=${token}`)
		},
		connectToMatch(serverUrl, matchId, token) {
			const wsUrl = serverUrl.replace(/^http/, 'ws')
			connect(`${wsUrl}/match/${matchId}?token=${token}`)
		},
		reconnect() {
			reconnectAttempts = 0
			if (lastUrl !== null) {
				connect(lastUrl, 'reconnecting')
			}
		},
		isConnected() {
			return ws?.readyState === OPEN_READY_STATE
		},
		getStatus() {
			return status
		},
		disconnect,
		send,
		setTribe(tribe) {
			send({ type: 'setTribe', tribe })
		},
		setReady(ready) {
			send({ type: 'setReady', ready })
		},
		startGame() {
			send({ type: 'startGame' })
		},
		sendAction(action) {
			send({ type: 'action', action })
		},
		sendActionRequest(action) {
			send({ type: 'actionRequest', action })
		},
		endTurn() {
			send({ type: 'endTurn' })
		},
		configureLobby(config) {
			send({ type: 'configureLobby', config })
		},
		setSlotBot(slotIndex, isBot, difficulty) {
			const message: Extract<ClientMessage, { type: 'setSlotBot' }> = {
				type: 'setSlotBot',
				slotIndex,
				isBot
			}
			if (difficulty !== undefined) {
				message.difficulty = difficulty
			}
			send(message)
		}
	}
}
