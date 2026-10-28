import { type Unit } from '../domains/unit'
import {
	type FilteredTileState,
	filteredGameStateSchema
} from '../fog-of-war/schema'
import {
	requireTestValue,
	createTestBoard,
	createTestGameState
} from '../test/game-test-helpers'
import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import {
	clientMessageTags,
	decodeClientMessage,
	decodeServerMessage,
	decodeServerWireFrame,
	encodeClientMessage,
	encodeServerMessage,
	encodeServerWireFrame,
	MULTIPLAYER_PROTOCOL_VERSION,
	serverMessageTags
} from './codec'
import { createVillage } from '../domains/village'
import { snapshotFor } from '../fog-of-war/snapshot'
import { MatchId } from '../ids'
import { type ClientMessage, type ServerMessage } from './types'

const decodeWireState = Schema.decodeUnknownSync(
	Schema.fromJsonString(filteredGameStateSchema)
)

function sampleFilteredGameState() {
	// Inject a capital village so codec roundtrip tests can assert the
	// `kind` flag survives the wire.
	const board = createTestBoard(2)
	const tile = board[2]?.[2]
	if (tile) {
		requireTestValue(board[2])[2] = {
			...tile,
			item: { ...createVillage(0, 'capital'), tribe: 'barbarians' }
		}
	}
	const projected = snapshotFor(
		createTestGameState({ board }),
		'barbarians'
	).projected
	if (Result.isFailure(projected)) {
		throw new Error(projected.failure.message)
	}
	// Wire fixtures normalize JSON numbers such as negative zero before exact roundtrip comparison.
	const decoded = decodeWireState(JSON.stringify(projected.success))
	return {
		...decoded,
		units: {
			...decoded.units,
			board: decoded.units.board.map((row) => [...row])
		}
	}
}

const clientSamples: Record<ClientMessage['type'], ClientMessage> = {
	action: {
		type: 'action',
		action: {
			type: 'move',
			from: { q: 0, r: 0, s: 0 },
			to: { q: 1, r: 0, s: -1 }
		}
	},
	actionRequest: {
		type: 'actionRequest',
		action: { kind: 'build', at: { q: 1, r: 2, s: -3 } }
	},
	endTurn: { type: 'endTurn' },
	setTribe: { type: 'setTribe', tribe: 'barbarians' },
	setReady: { type: 'setReady', ready: true },
	startGame: { type: 'startGame' },
	configureLobby: {
		type: 'configureLobby',
		config: { mapSize: 'medium' }
	},
	setSlotBot: {
		type: 'setSlotBot',
		slotIndex: 2,
		isBot: true,
		difficulty: 'Intermediate'
	}
}

const serverSamples: Record<ServerMessage['type'], ServerMessage> = {
	lobbyUpdate: {
		type: 'lobbyUpdate',
		lobby: {
			lobbyId: 'l1',
			inviteCode: 'ABC123',
			kind: 'private',
			config: { mapSize: 'medium', maxPlayers: 4, turnTimerSeconds: 90 },
			slots: [],
			phase: 'waiting'
		}
	},
	gameStart: { type: 'gameStart', matchId: 'match-1' },
	gameState: {
		type: 'gameState',
		state: sampleFilteredGameState(),
		currentTurn: 'orcs',
		turnEndsAt: 12_345,
		viewer: 'orcs'
	},
	actionResult: { type: 'actionResult', success: true, message: 'ok' },
	playerForfeited: {
		type: 'playerForfeited',
		tribe: 'templars',
		username: 'alice'
	},
	gameEnd: {
		type: 'gameEnd',
		result: {
			matchId: MatchId.make('m'),
			winner: 'engineers',
			players: [],
			duration: 600,
			turnCount: 30,
			mapSize: 'medium',
			completedAt: '2026-01-01T00:00:00Z'
		}
	},
	error: { type: 'error', message: 'boom' },
	turnTimerUpdate: { type: 'turnTimerUpdate', turnEndsAt: 999 },
	turnEvents: {
		type: 'turnEvents',
		events: [
			{ type: 'salary', tribe: 'barbarians', amount: 3 },
			{ type: 'turnRotated', from: 'barbarians', to: 'rogues', turn: 2 }
		]
	},
	chronicleEntries: {
		type: 'chronicleEntries',
		entries: [{ kind: 'turnAdvanced', actorTribe: 'rogues', turn: 2 }]
	},
	achievementsUnlocked: {
		type: 'achievementsUnlocked',
		tribe: 'barbarians',
		achievementIds: ['first-win', 'beat-beginner-bot']
	}
}

function encodeServerFrame(message: ServerMessage): string {
	return encodeServerWireFrame({
		sequence: null,
		messageId: null,
		message
	})
}

// Malformed wire fixtures deliberately bypass domain parsing to exercise rejection.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
function encodeRawServerFrame(message: unknown): string {
	return JSON.stringify({
		protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
		sequence: null,
		messageId: null,
		message
	})
}

describe('clientMessageSchema', () => {
	it.each(Object.entries(clientSamples))('roundtrips %s', (_tag, sample) => {
		const encoded = encodeClientMessage(sample)
		const decoded = decodeClientMessage(encoded)
		expect(Result.isSuccess(decoded)).toBe(true)
		assert(Result.isSuccess(decoded))
		expect(decoded.success).toEqual(sample)
	})
})

describe('serverMessageSchema', () => {
	it.each(Object.entries(serverSamples))('roundtrips %s', (_tag, sample) => {
		const encoded = encodeServerFrame(sample)
		const decoded = decodeServerMessage(encoded)
		expect(Result.isSuccess(decoded)).toBe(true)
		assert(Result.isSuccess(decoded))
		expect(decoded.success).toEqual(sample)
	})

	it('preserves the village.kind flag through a gameState roundtrip', () => {
		const sample = serverSamples.gameState
		const encoded = encodeServerFrame(sample)
		const decoded = decodeServerMessage(encoded)
		expect(Result.isSuccess(decoded)).toBe(true)
		assert(Result.isSuccess(decoded))
		assert(decoded.success.type === 'gameState')

		const villageKinds = new Set<string>()
		for (const row of decoded.success.state.units.board) {
			for (const tile of row) {
				if (tile?.item?.type === 'village') {
					villageKinds.add(tile.item.kind)
				}
			}
		}
		// At least one village (the starting capital) must roundtrip its kind.
		expect(villageKinds.size).toBeGreaterThan(0)
		expect(villageKinds.has('capital')).toBe(true)
	})

	it('roundtrips a gameState carrying a unit with the flying passive', () => {
		const baseState = sampleFilteredGameState()
		// Inject a flying unit on a known tile so the encoder/decoder cycle has
		// to preserve the new passive variant.
		const flyer: Unit = {
			id: 'unit_flyer_1',
			type: 'caveman',
			tribe: 'barbarians',
			stats: {
				health: 20,
				attack: 10,
				canAttackAfterMove: true,
				canCaptureAfterMove: false,
				defense: 8,
				movement: 1,
				waterMovement: 1,
				range: 1,
				waterRange: 1,
				cost: 2,
				air: false,
				explorationRange: 1,
				specialAttackAttribute: null,
				requiredTech: null,
				passive: 'flying'
			}
		}
		const tile = requireTestValue(requireTestValue(baseState.units.board[2])[2])
		assert(tile.terrain !== null)
		requireTestValue(baseState.units.board[2])[2] = { ...tile, unit: flyer }

		const message: ServerMessage = {
			type: 'gameState',
			state: baseState,
			currentTurn: 'barbarians',
			turnEndsAt: null,
			viewer: 'barbarians'
		}
		const encoded = encodeServerFrame(message)
		const decoded = decodeServerMessage(encoded)
		expect(Result.isSuccess(decoded)).toBe(true)
		assert(Result.isSuccess(decoded))
		expect(decoded.success).toEqual(message)
	})

	it('roundtrips an enveloped server wire frame with protocol metadata', () => {
		const message = serverSamples.actionResult
		const encoded = encodeServerWireFrame({
			sequence: 7,
			messageId: 'match-7',
			message
		})
		const decoded = decodeServerWireFrame(encoded)
		expect(Result.isSuccess(decoded)).toBe(true)
		assert(Result.isSuccess(decoded))
		expect(decoded.success).toEqual({
			protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
			sequence: 7,
			messageId: 'match-7',
			message
		})
	})

	it('rejects legacy bare server messages', () => {
		const message = serverSamples.error
		const decoded = decodeServerWireFrame(encodeServerMessage(message))
		expect(Result.isFailure(decoded)).toBe(true)
	})
})

describe('decode errors', () => {
	it('returns typed error for invalid JSON', () => {
		const result = decodeClientMessage('not json {')
		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('WireDecodeError')
		expect(result.failure.message).toBe('Invalid JSON')
	})

	it('returns typed error for unknown client message type', () => {
		const result = decodeClientMessage(JSON.stringify({ type: 'unknownTag' }))
		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('WireDecodeError')
	})

	it('returns typed error for unknown server message type', () => {
		const result = decodeServerMessage(encodeRawServerFrame({ type: 'nope' }))
		expect(Result.isFailure(result)).toBe(true)
	})

	it('returns typed error for missing discriminator', () => {
		const result = decodeServerMessage(encodeRawServerFrame({ message: 'hi' }))
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects invalid tribe on setTribe', () => {
		const result = decodeClientMessage(
			JSON.stringify({ type: 'setTribe', tribe: 'moon-people' })
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects wrong type on setReady', () => {
		const result = decodeClientMessage(
			JSON.stringify({ type: 'setReady', ready: 'yes' })
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects malformed gameAction payloads', () => {
		const result = decodeClientMessage(
			JSON.stringify({
				type: 'action',
				action: { type: 'move', from: { q: 0, r: 0, s: 0 } }
			})
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects invalid action intent payloads', () => {
		const result = decodeClientMessage(
			JSON.stringify({
				type: 'actionRequest',
				action: {
					kind: 'train',
					unit: 'not-a-unit',
					at: { q: 0, r: 0, s: 0 }
				}
			})
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects malformed lobbyState payloads', () => {
		const result = decodeServerMessage(
			encodeRawServerFrame({
				type: 'lobbyUpdate',
				lobby: { lobbyId: 'l1', inviteCode: 'ABC123', phase: 'waiting' }
			})
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects malformed matchResult payloads', () => {
		const result = decodeServerMessage(
			encodeRawServerFrame({
				type: 'gameEnd',
				result: {
					matchId: 'm',
					winner: null,
					players: [],
					duration: 600,
					mapSize: 'medium',
					completedAt: '2026-01-01T00:00:00Z'
				}
			})
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects malformed broadcastEvent payloads', () => {
		const result = decodeServerMessage(
			encodeRawServerFrame({
				type: 'turnEvents',
				events: [{ type: 'salary', tribe: 'barbarians', amount: 'three' }]
			})
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects malformed filteredGameState payloads', () => {
		const result = decodeServerMessage(
			encodeRawServerFrame({
				type: 'gameState',
				state: { playerStates: {} },
				currentTurn: 'barbarians',
				turnEndsAt: null
			})
		)
		expect(Result.isFailure(result)).toBe(true)
	})

	it('rejects unsupported server wire protocol versions', () => {
		const result = decodeServerWireFrame(
			JSON.stringify({
				protocolVersion: 999,
				sequence: 1,
				messageId: 'future',
				message: { type: 'error', message: 'future client' }
			})
		)
		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure.message).toContain('Unsupported protocol version')
	})
})

describe('encoding', () => {
	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		'rejects a non-finite deadline %s before serialization',
		(turnEndsAt) => {
			expect(() =>
				encodeServerMessage({ type: 'turnTimerUpdate', turnEndsAt })
			).toThrow(/finite/i)
		}
	)

	it.each(['1e309', '-1e309'])(
		'rejects numeric overflow %s at the wire boundary',
		(deadline) => {
			const decoded = decodeServerMessage(
				`{"type":"turnTimerUpdate","turnEndsAt":${deadline}}`
			)
			expect(Result.isFailure(decoded)).toBe(true)
		}
	)

	it('throws when encoding an invalid ClientMessage', () => {
		expect(() =>
			// Call the encoder as an untyped wire caller would; invalid input must fail its schema.
			// oxlint-disable-next-line anti-slop/no-reflect-apply
			Reflect.apply(encodeClientMessage, undefined, [
				{ type: 'setTribe', tribe: 'invalid' }
			])
		).toThrow(/tribe/)
	})

	it('throws when encoding an invalid ServerMessage', () => {
		expect(() =>
			// Call the encoder as an untyped wire caller would; invalid input must fail its schema.
			// oxlint-disable-next-line anti-slop/no-reflect-apply
			Reflect.apply(encodeServerMessage, undefined, [
				{ type: 'error', message: 42 }
			])
		).toThrow(/Expected string[\s\S]*message/)
	})
})

describe('building roster (Hexwardens)', () => {
	function gameStateWith(
		item: Extract<
			FilteredTileState['item'],
			{ type: 'secondaryBuilding' | 'utilityBuilding' }
		>
	): ServerMessage {
		const filtered = sampleFilteredGameState()
		// Inject at (2,2) — that tile holds the barbarians village in
		// `sampleFilteredGameState`, so it is visible and carries real terrain
		// in the projection. Fogged tiles cannot host items in the wire schema.
		const visibleTile = requireTestValue(filtered.units.board[2])[2]
		if (!visibleTile || visibleTile.terrain === null) {
			throw new Error('expected visible tile at (2,2)')
		}
		requireTestValue(filtered.units.board[2])[2] = { ...visibleTile, item }
		return {
			type: 'gameState',
			state: filtered,
			currentTurn: 'barbarians',
			turnEndsAt: null,
			viewer: 'barbarians'
		}
	}

	it('round-trips a Large secondary building (state: large)', () => {
		const msg = gameStateWith({
			type: 'secondaryBuilding',
			value: 'stables',
			state: 'large',
			tribe: 'barbarians'
		})
		const decoded = decodeServerMessage(encodeServerFrame(msg))
		expect(Result.isSuccess(decoded)).toBe(true)
	})

	it('round-trips a utility building (market)', () => {
		const msg = gameStateWith({
			type: 'utilityBuilding',
			value: 'market',
			state: 'built',
			tribe: 'barbarians'
		})
		const decoded = decodeServerMessage(encodeServerFrame(msg))
		expect(Result.isSuccess(decoded)).toBe(true)
	})

	it('round-trips the upgrade-to-large action request', () => {
		const msg: ClientMessage = {
			type: 'actionRequest',
			action: { kind: 'upgrade-to-large', at: { q: 0, r: 0, s: 0 } }
		}
		const decoded = decodeClientMessage(encodeClientMessage(msg))
		expect(Result.isSuccess(decoded)).toBe(true)
	})
})

describe('exhaustiveness', () => {
	it('clientMessageSchema covers every ClientMessage variant', () => {
		const sampleTags = new Set(Object.keys(clientSamples))
		expect(clientMessageTags).toEqual(sampleTags)
	})

	it('serverMessageSchema covers every ServerMessage variant', () => {
		const sampleTags = new Set(Object.keys(serverSamples))
		expect(serverMessageTags).toEqual(sampleTags)
	})
})
