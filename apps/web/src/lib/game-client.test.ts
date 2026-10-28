import { describe, expect, it, vi } from 'vite-plus/test'
import { encodeServerWireFrame } from '@hexwardens/game-logic/multiplayer/codec'
import { type ServerMessage } from '@hexwardens/game-logic/multiplayer/types'
import {
	createGameClient,
	type GameConnectionStatus,
	type ServerMessageHandlers,
	type WebSocketLike
} from './game-client'

const OPEN = 1
const CLOSED = 3

/**
 * In-memory WebSocket — drives `createGameClient` from tests without
 * touching the real browser WebSocket API.
 */
class FakeSocket implements WebSocketLike {
	readyState = 0
	url: string
	sent: string[] = []
	closed = false
	onopen: ((ev: Event) => void) | null = null
	onmessage: ((ev: MessageEvent<string>) => void) | null = null
	onclose: ((ev: CloseEvent) => void) | null = null
	onerror: ((ev: Event) => void) | null = null

	constructor(url: string) {
		this.url = url
	}

	open() {
		this.readyState = OPEN
		this.onopen?.(new Event('open'))
	}

	frameSequence = 0

	receive(msg: ServerMessage) {
		this.frameSequence += 1
		this.onmessage?.(
			new MessageEvent('message', {
				data: encodeServerWireFrame({
					sequence: this.frameSequence,
					messageId: `frame-${this.frameSequence}`,
					message: msg
				})
			})
		)
	}

	receiveRaw(raw: string) {
		this.onmessage?.(new MessageEvent('message', { data: raw }))
	}

	send(data: string) {
		this.sent.push(data)
	}

	close() {
		this.readyState = CLOSED
		this.closed = true
		this.onclose?.(new CloseEvent('close'))
	}
}

function makeHandlers() {
	const calls: Array<{ type: string; msg: ServerMessage }> = []
	const record = (msg: ServerMessage) => calls.push({ type: msg.type, msg })
	const handlers: ServerMessageHandlers = {
		lobbyUpdate: record,
		gameStart: record,
		gameState: record,
		actionResult: record,
		playerForfeited: record,
		gameEnd: record,
		error: record,
		turnTimerUpdate: record,
		turnEvents: record,
		chronicleEntries: record,
		achievementsUnlocked: record
	}
	return { handlers, calls }
}

function makeClient() {
	let socket: FakeSocket | null = null
	const { handlers, calls } = makeHandlers()
	const onClose = vi.fn<() => void>()
	const onDecodeError =
		vi.fn<
			NonNullable<Parameters<typeof createGameClient>[0]['onDecodeError']>
		>()
	const statusChanges: GameConnectionStatus[] = []
	const client = createGameClient({
		handlers,
		onClose,
		onDecodeError,
		onStatusChange: (status) => statusChanges.push(status),
		webSocketFactory: (url) => {
			socket = new FakeSocket(url)
			return socket
		}
	})
	return {
		client,
		calls,
		onClose,
		onDecodeError,
		statusChanges,
		getSocket: () => {
			if (socket === null) {
				throw new Error('Expected connected socket')
			}
			return socket
		}
	}
}

describe('createGameClient dispatch', () => {
	const serverCases: ServerMessage[] = [
		{
			type: 'lobbyUpdate',
			lobby: {
				lobbyId: 'l',
				inviteCode: 'ABC123',
				kind: 'private',
				config: { mapSize: 'small', maxPlayers: 4, turnTimerSeconds: null },
				slots: [],
				phase: 'waiting'
			}
		},
		{ type: 'gameStart', matchId: 'm1' },
		{ type: 'actionResult', success: false, message: 'nope' },
		{ type: 'playerForfeited', tribe: 'orcs', username: 'bob' },
		{ type: 'error', message: 'oops' },
		{ type: 'turnTimerUpdate', turnEndsAt: 42 }
	]

	it.each(serverCases)('dispatches $type to its handler', (msg) => {
		const { client, calls, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		getSocket().receive(msg)
		expect(calls).toHaveLength(1)
		expect(calls[0]?.type).toBe(msg.type)
		expect(calls[0]?.msg).toEqual(msg)
	})

	it('reports decode errors via onDecodeError without crashing', () => {
		const { client, calls, onDecodeError, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		getSocket().receiveRaw('not json')
		expect(onDecodeError).toHaveBeenCalledOnce()
		expect(calls).toHaveLength(0)
	})

	it('reports typed error for unknown server message tag', () => {
		const { client, calls, onDecodeError, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		getSocket().receiveRaw(JSON.stringify({ type: 'mystery' }))
		expect(onDecodeError).toHaveBeenCalledOnce()
		expect(onDecodeError.mock.calls[0]?.[0]?._tag).toBe('WireDecodeError')
		expect(calls).toHaveLength(0)
	})

	it('dispatches enveloped server frames and records connection metadata', () => {
		const { client, calls, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		getSocket().receiveRaw(
			encodeServerWireFrame({
				sequence: 12,
				messageId: 'server-12',
				message: { type: 'actionResult', success: true, message: 'ok' }
			})
		)
		expect(calls).toHaveLength(1)
		expect(calls[0]?.type).toBe('actionResult')
		expect(client.getStatus().lastServerSequence).toBe(12)
		expect(client.getStatus().lastMessageAt).not.toBeNull()
	})
})

describe('createGameClient send', () => {
	it('validates and serializes every ClientMessage variant the helpers produce', () => {
		const { client, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()

		client.setTribe('barbarians')
		client.setReady(true)
		client.startGame()
		client.sendActionRequest({
			kind: 'build',
			at: { q: 0, r: 0, s: 0 }
		})
		client.endTurn()
		client.configureLobby({ mapSize: 'large' })
		client.setSlotBot(1, true, 'Expert')

		const parsed = getSocket().sent.map((frame) => JSON.parse(frame))
		expect(parsed).toEqual([
			{ type: 'setTribe', tribe: 'barbarians' },
			{ type: 'setReady', ready: true },
			{ type: 'startGame' },
			{
				type: 'actionRequest',
				action: {
					kind: 'build',
					at: { q: 0, r: 0, s: 0 }
				}
			},
			{ type: 'endTurn' },
			{ type: 'configureLobby', config: { mapSize: 'large' } },
			{
				type: 'setSlotBot',
				slotIndex: 1,
				isBot: true,
				difficulty: 'Expert'
			}
		])
	})

	it('queues sends before the socket opens, then flushes on open', () => {
		const { client, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		// Before open: queued.
		client.setReady(false)
		expect(getSocket().sent).toEqual([])
		getSocket().open()
		// After open: flushed.
		expect(getSocket().sent).toHaveLength(1)
		expect(JSON.parse(getSocket().sent[0] ?? 'null')).toEqual({
			type: 'setReady',
			ready: false
		})
	})

	it('throws when caller hands send() an invalid message', () => {
		const { client, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		expect(() => {
			// @ts-expect-error The runtime encoder must reject callers that bypass TypeScript.
			client.send({ type: 'setTribe', tribe: 'nonsense' })
		}).toThrow(/tribe|nonsense/)
	})
})

describe('createGameClient lifecycle', () => {
	it('notifies status changes through connect, open, close, and reconnect', () => {
		vi.useFakeTimers()
		try {
			const { client, statusChanges, getSocket } = makeClient()
			client.connectToMatch('http://x', 'm', 't')
			expect(client.getStatus().state).toBe('connecting')
			getSocket().open()
			expect(client.getStatus().state).toBe('open')
			getSocket().close()
			// An unexpected close now schedules an automatic reconnect instead
			// of going straight to `closed`.
			expect(client.getStatus().state).toBe('reconnecting')
			client.reconnect()
			expect(client.getStatus().state).toBe('reconnecting')
			expect(statusChanges.map((status) => status.state)).toEqual([
				'connecting',
				'open',
				'reconnecting',
				'reconnecting'
			])
			client.disconnect()
		} finally {
			vi.useRealTimers()
		}
	})

	it('automatically reconnects with backoff after an unexpected close', () => {
		vi.useFakeTimers()
		try {
			const { client, getSocket } = makeClient()
			client.connectToMatch('http://x', 'm', 't')
			const first = getSocket()
			first.open()
			first.close()
			expect(client.getStatus().state).toBe('reconnecting')
			// First retry fires within base delay + jitter (500–750ms).
			vi.advanceTimersByTime(750)
			const second = getSocket()
			expect(second).not.toBe(first)
			second.open()
			expect(client.getStatus().state).toBe('open')
			client.disconnect()
		} finally {
			vi.useRealTimers()
		}
	})

	it('gives up after exhausting reconnect attempts', () => {
		vi.useFakeTimers()
		try {
			const { client, getSocket } = makeClient()
			client.connectToMatch('http://x', 'm', 't')
			getSocket().open()
			getSocket().close()
			// Burn through every scheduled retry; each socket immediately closes.
			for (let i = 0; i < 12; i++) {
				vi.advanceTimersByTime(31_000)
				getSocket().close()
			}
			expect(client.getStatus().state).toBe('closed')
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('disconnect cancels a pending automatic reconnect', () => {
		vi.useFakeTimers()
		try {
			const { client, getSocket } = makeClient()
			client.connectToMatch('http://x', 'm', 't')
			getSocket().open()
			getSocket().close()
			client.disconnect()
			expect(vi.getTimerCount()).toBe(0)
			expect(client.getStatus().state).toBe('closed')
		} finally {
			vi.useRealTimers()
		}
	})

	it('invokes onClose only for an unexpected open socket closure', () => {
		const { client, onClose, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		getSocket().close()
		expect(onClose).toHaveBeenCalledOnce()
		client.disconnect()
		expect(onClose).toHaveBeenCalledOnce()
	})

	it('keeps intentional cleanup quiet before and after the socket opens', () => {
		const { client, onClose, getSocket } = makeClient()
		client.connectToMatch('http://x', 'm', 't')
		client.disconnect()
		client.connectToMatch('http://x', 'm', 't')
		getSocket().open()
		client.disconnect()
		expect(onClose).not.toHaveBeenCalled()
		expect(client.getStatus().state).toBe('closed')
	})

	it('disconnect clears queued messages', () => {
		const { client, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		client.setReady(true) // queued
		client.disconnect()
		// Reconnect — opening the new socket must not replay the old queue.
		client.connectToLobby('http://x', 'l', 't')
		getSocket().open()
		expect(getSocket().sent).toEqual([])
	})

	it('reconnecting after disconnect uses a fresh socket', () => {
		const { client, getSocket } = makeClient()
		client.connectToLobby('http://x', 'l', 't')
		const first = getSocket()
		client.disconnect()
		client.connectToMatch('http://x', 'm', 't')
		const second = getSocket()
		expect(first).not.toBe(second)
		expect(first.closed).toBe(true)
	})
})
