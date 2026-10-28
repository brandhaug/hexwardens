import { Result } from 'effect'
import {
	decodeServerWireFrame,
	MULTIPLAYER_PROTOCOL_VERSION
} from '@hexwardens/game-logic/multiplayer/codec'
import {
	createConnectionLifecycle,
	isMatchConnectionMetadata,
	isMatchmakerConnectionMetadata,
	type ConnectionMetadata,
	type ConnectionLifecycleDeps,
	type MatchConnectionMetadata,
	type MatchmakerConnectionMetadata
} from './ws-connection'
import { type ServerMessage } from './types'

/**
 * In-memory hibernatable-socket fake. `serializeAttachment` round-trips
 * through `structuredClone` to mirror the runtime's structured serialization
 * — non-cloneable metadata would throw here just like in production.
 */
class FakeSocket {
	readyState = 1
	sent: string[] = []
	accepted = false
	acceptTags: string[] | undefined
	private attachment: unknown

	send(data: string) {
		this.sent.push(data)
	}

	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Fake implements the Cloudflare structured-clone input contract.
	serializeAttachment(value: unknown) {
		this.attachment = structuredClone(value)
	}

	// oxlint-disable-next-line anti-slop/no-unknown-returns -- Fake returns untrusted attachments so malformed-input coverage exercises the decoder.
	deserializeAttachment(): unknown {
		return this.attachment
	}
}

type Harness<M extends ConnectionMetadata> = {
	lifecycle: ReturnType<typeof createConnectionLifecycle<M, FakeSocket>>
	deps: ConnectionLifecycleDeps<M, FakeSocket>
	counts: () => { increments: number; decrements: number }
}

function createHarness<M extends ConnectionMetadata>(
	isMetadata: ConnectionLifecycleDeps<M, FakeSocket>['isMetadata']
): Harness<M> {
	let increments = 0
	let decrements = 0
	const deps: ConnectionLifecycleDeps<M, FakeSocket> = {
		isMetadata,
		acceptSocket: (ws, tags) => {
			ws.accepted = true
			ws.acceptTags = tags
		},
		presenceIncrement: () => {
			increments += 1
		},
		presenceDecrement: () => {
			decrements += 1
		}
	}
	return {
		lifecycle: createConnectionLifecycle<M, FakeSocket>(deps),
		deps,
		counts: () => ({ increments, decrements })
	}
}

const matchMetadata: MatchConnectionMetadata = {
	playerId: 'p-1',
	username: 'Alice',
	tribe: 'barbarians'
}

const matchmakerMetadata: MatchmakerConnectionMetadata = {
	playerId: 'p-2',
	username: 'Bob',
	lobbyId: 'lobby-1'
}

const errorMessage: ServerMessage = { type: 'error', message: 'boom' }

describe('metadata roundtrip', () => {
	it('accepts, attaches, and reads back Match metadata', () => {
		const { lifecycle, counts } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()

		lifecycle.accept(ws, matchMetadata)

		expect(ws.accepted).toBe(true)
		expect(lifecycle.read(ws)).toMatchObject(matchMetadata)
		expect(counts()).toEqual({ increments: 1, decrements: 0 })
	})

	it('accepts, attaches, and reads back Matchmaker metadata (generic shape)', () => {
		const { lifecycle } = createHarness(isMatchmakerConnectionMetadata)
		const ws = new FakeSocket()

		lifecycle.accept(ws, matchmakerMetadata, ['lobby:lobby-1'])

		expect(ws.acceptTags).toEqual(['lobby:lobby-1'])
		expect(lifecycle.read(ws)).toMatchObject(matchmakerMetadata)
	})

	it('returns null for a socket with no attachment', () => {
		const { lifecycle } = createHarness(isMatchConnectionMetadata)
		expect(lifecycle.read(new FakeSocket())).toBeNull()
	})

	it('returns null for a malformed attachment', () => {
		const { lifecycle } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		ws.serializeAttachment({
			playerId: 'p-1',
			username: 'Alice',
			tribe: 'not-a-tribe'
		})
		expect(lifecycle.read(ws)).toBeNull()
	})

	it('rejects an attachment with the other DO shape', () => {
		const { lifecycle } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		ws.serializeAttachment({ ...matchmakerMetadata, presenceCounted: true })
		expect(lifecycle.read(ws)).toBeNull()
	})
})

describe('attachment guards', () => {
	it('isMatchConnectionMetadata requires a valid tribe', () => {
		expect(isMatchConnectionMetadata({ ...matchMetadata })).toBe(true)
		expect(
			isMatchConnectionMetadata({ ...matchMetadata, tribe: 'martians' })
		).toBe(false)
		expect(isMatchConnectionMetadata({ playerId: 'p-1' })).toBe(false)
	})

	it('isMatchmakerConnectionMetadata requires string lobby fields', () => {
		expect(isMatchmakerConnectionMetadata({ ...matchmakerMetadata })).toBe(true)
		expect(
			isMatchmakerConnectionMetadata({ ...matchmakerMetadata, lobbyId: 7 })
		).toBe(false)
	})
})

describe('sequence-numbered send', () => {
	it('wraps messages in the server wire frame with per-socket sequences', () => {
		const { lifecycle } = createHarness(isMatchConnectionMetadata)
		const ws1 = new FakeSocket()
		const ws2 = new FakeSocket()

		lifecycle.send(ws1, errorMessage)
		lifecycle.send(ws1, errorMessage)
		lifecycle.send(ws2, errorMessage)

		expect(ws1.sent).toHaveLength(2)
		expect(ws2.sent).toHaveLength(1)

		const frames = [...ws1.sent, ...ws2.sent].map((raw) => {
			const decoded = decodeServerWireFrame(raw)
			expect(Result.isSuccess(decoded)).toBe(true)
			return Result.isSuccess(decoded) ? decoded.success : null
		})

		expect(frames.map((f) => f?.sequence)).toEqual([1, 2, 1])
		expect(frames.map((f) => f?.messageId)).toEqual([
			'server-1',
			'server-2',
			'server-1'
		])
		expect(frames[0]?.protocolVersion).toBe(MULTIPLAYER_PROTOCOL_VERSION)
		expect(frames[0]?.message).toEqual(errorMessage)
	})

	it('does not send (or consume a sequence) on a non-open socket', () => {
		const { lifecycle } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		ws.readyState = 3

		lifecycle.send(ws, errorMessage)
		expect(ws.sent).toHaveLength(0)

		ws.readyState = 1
		lifecycle.send(ws, errorMessage)
		const decoded = decodeServerWireFrame(ws.sent[0] ?? '')
		expect(Result.isSuccess(decoded) && decoded.success.sequence).toBe(1)
	})

	it('sequences restart at 1 after a hibernation wake (new lifecycle instance)', () => {
		const first = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		first.lifecycle.send(ws, errorMessage)
		first.lifecycle.send(ws, errorMessage)

		// A hibernation wake re-constructs the DO and with it the lifecycle;
		// sequence state is in-memory by design and restarts.
		const woken = createConnectionLifecycle<
			MatchConnectionMetadata,
			FakeSocket
		>(first.deps)
		woken.send(ws, errorMessage)

		const decoded = decodeServerWireFrame(ws.sent[2] ?? '')
		expect(Result.isSuccess(decoded) && decoded.success.sequence).toBe(1)
	})
})

describe('release idempotency', () => {
	it('decrements presence exactly once when close and error both fire', () => {
		const { lifecycle, counts } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		lifecycle.accept(ws, matchMetadata)

		const first = lifecycle.release(ws) // webSocketClose
		const second = lifecycle.release(ws) // webSocketError for the same socket

		expect(first).toEqual({
			released: true,
			metadata: expect.objectContaining(matchMetadata)
		})
		expect(second.released).toBe(false)
		expect(second.metadata).toMatchObject(matchMetadata)
		expect(counts()).toEqual({ increments: 1, decrements: 1 })
	})

	it('survives a hibernation wake — the flag lives on the attachment, not in memory', () => {
		const first = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		first.lifecycle.accept(ws, matchMetadata)
		expect(first.lifecycle.release(ws).released).toBe(true)

		// New lifecycle instance (re-constructed DO) sees the durable flag.
		const woken = createHarness(isMatchConnectionMetadata)
		const replay = woken.lifecycle.release(ws)
		expect(replay.released).toBe(false)
		expect(woken.counts().decrements).toBe(0)
	})

	it('returns released: false with null metadata for unattached sockets', () => {
		const { lifecycle, counts } = createHarness(isMatchConnectionMetadata)
		expect(lifecycle.release(new FakeSocket())).toEqual({
			released: false,
			metadata: null
		})
		expect(counts().decrements).toBe(0)
	})

	it('returns released: false with null metadata for malformed attachments', () => {
		const { lifecycle, counts } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		ws.serializeAttachment({ presenceCounted: true })
		expect(lifecycle.release(ws)).toEqual({ released: false, metadata: null })
		expect(counts().decrements).toBe(0)
	})

	it('keeps metadata readable after release', () => {
		const { lifecycle } = createHarness(isMatchConnectionMetadata)
		const ws = new FakeSocket()
		lifecycle.accept(ws, matchMetadata)
		lifecycle.release(ws)
		expect(lifecycle.read(ws)).toMatchObject(matchMetadata)
	})
})
