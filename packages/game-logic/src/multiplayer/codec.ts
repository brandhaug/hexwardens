import { Predicate, Result, Schema } from 'effect'

import { achievementIds } from '../achievements/registry'
import { difficulties } from '../difficulty'
import { techs } from '../domains/tech'
import { unitTypes } from '../domains/unit'
import { filteredGameStateSchema as filteredGameStatePayloadSchema } from '../fog-of-war/schema'
import { MatchId, PlayerId, Username } from '../ids'
import {
	nonNegativeIntSchema,
	resourceSchema,
	tileItemSchema,
	tribeSchema,
	villagePerkSchema
} from './wire-schemas'
import {
	mapSizes,
	type ClientMessage,
	type ServerMessage,
	type ServerWireFrame,
	type WireActionIntent
} from './types'

export const MULTIPLAYER_PROTOCOL_VERSION = 1

export class WireDecodeError extends Schema.TaggedError<WireDecodeError>()(
	'WireDecodeError',
	{
		message: Schema.String,
		raw: Schema.String,
		cause: Schema.optionalKey(Schema.Unknown)
	}
) {}

const difficultySchema = Schema.Literals(difficulties)
const mapSizeSchema = Schema.Literals(mapSizes)
const unitTypeSchema = Schema.Literals(unitTypes)
const techSchema = Schema.Literals(techs)

const hexCoordinateSchema = Schema.Struct({
	q: Schema.Finite,
	r: Schema.Finite,
	s: Schema.Finite
})

const partialLobbyConfigSchema = Schema.Struct({
	mapSize: Schema.optionalKey(mapSizeSchema),
	maxPlayers: Schema.optionalKey(Schema.Finite),
	turnTimerSeconds: Schema.optionalKey(Schema.NullOr(Schema.Finite))
})

const wireActionIntentSchema: Schema.Codec<WireActionIntent> = Schema.Union([
	Schema.Struct({ kind: Schema.Literal('build'), at: hexCoordinateSchema }),
	Schema.Struct({ kind: Schema.Literal('capture'), at: hexCoordinateSchema }),
	Schema.Struct({ kind: Schema.Literal('collect'), at: hexCoordinateSchema }),
	Schema.Struct({ kind: Schema.Literal('explore'), at: hexCoordinateSchema }),
	Schema.Struct({ kind: Schema.Literal('heal'), at: hexCoordinateSchema }),
	Schema.Struct({ kind: Schema.Literal('recover'), at: hexCoordinateSchema }),
	Schema.Struct({ kind: Schema.Literal('retire'), at: hexCoordinateSchema }),
	Schema.Struct({
		kind: Schema.Literal('upgrade-to-large'),
		at: hexCoordinateSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('train'),
		at: hexCoordinateSchema,
		unit: unitTypeSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('research'),
		at: hexCoordinateSchema,
		tech: techSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('selectPerk'),
		at: hexCoordinateSchema,
		perk: villagePerkSchema
	})
])

const gameActionSchema = Schema.Union([
	Schema.Struct({
		type: Schema.Literal('move'),
		from: hexCoordinateSchema,
		to: hexCoordinateSchema
	}),
	Schema.Struct({
		type: Schema.Literal('train'),
		hex: hexCoordinateSchema,
		unitType: unitTypeSchema
	}),
	Schema.Struct({
		type: Schema.Literal('build'),
		hex: hexCoordinateSchema,
		tileItem: tileItemSchema
	}),
	Schema.Struct({
		type: Schema.Literal('upgrade-to-large'),
		hex: hexCoordinateSchema
	}),
	Schema.Struct({
		type: Schema.Literal('explore'),
		hex: hexCoordinateSchema
	}),
	Schema.Struct({
		type: Schema.Literal('attack'),
		from: hexCoordinateSchema,
		to: hexCoordinateSchema
	}),
	Schema.Struct({
		type: Schema.Literal('collect'),
		hex: hexCoordinateSchema,
		value: resourceSchema
	}),
	Schema.Struct({
		type: Schema.Literal('research'),
		tech: techSchema
	}),
	Schema.Struct({ type: Schema.Literal('endTurn') })
])

const filteredGameStateSchema = filteredGameStatePayloadSchema

const lobbyConfigSchema = Schema.Struct({
	mapSize: mapSizeSchema,
	maxPlayers: Schema.Finite,
	turnTimerSeconds: Schema.NullOr(Schema.Finite)
})

const lobbySlotSchema = Schema.Struct({
	playerId: Schema.String,
	username: Schema.String,
	tribe: Schema.NullOr(tribeSchema),
	isBot: Schema.Boolean,
	botDifficulty: difficultySchema,
	isReady: Schema.Boolean,
	isHost: Schema.Boolean
})

const lobbyStateSchema = Schema.Struct({
	lobbyId: Schema.String,
	inviteCode: Schema.String,
	kind: Schema.Literals(['private', 'publicQueue']),
	config: lobbyConfigSchema,
	slots: Schema.mutable(Schema.Array(lobbySlotSchema)),
	phase: Schema.Literals(['waiting', 'starting'])
})

const matchResultSchema = Schema.Struct({
	matchId: MatchId,
	winner: Schema.NullOr(tribeSchema),
	players: Schema.mutable(
		Schema.Array(
			Schema.Struct({
				playerId: PlayerId,
				username: Username,
				tribe: tribeSchema,
				isBot: Schema.Boolean
			})
		)
	),
	duration: Schema.Finite,
	turnCount: nonNegativeIntSchema,
	mapSize: Schema.String,
	completedAt: Schema.String
})

const broadcastEventSchema = Schema.Union([
	Schema.Struct({
		type: Schema.Literal('salary'),
		tribe: tribeSchema,
		amount: Schema.Finite
	}),
	Schema.Struct({
		type: Schema.Literal('research'),
		tribe: tribeSchema,
		tech: techSchema,
		completed: Schema.Boolean,
		turnsRemaining: Schema.optionalKey(nonNegativeIntSchema)
	}),
	Schema.Struct({
		type: Schema.Literal('villageLevel'),
		tribe: tribeSchema,
		levelUps: nonNegativeIntSchema
	}),
	Schema.Struct({
		type: Schema.Literal('turnRotated'),
		from: tribeSchema,
		to: tribeSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		type: Schema.Literal('villageCaptured'),
		byTribe: tribeSchema,
		fromTribe: Schema.NullOr(tribeSchema),
		at: Schema.Struct({
			q_idx: Schema.Finite.pipe(Schema.check(Schema.isInt())),
			r_idx: Schema.Finite.pipe(Schema.check(Schema.isInt()))
		})
	}),
	Schema.Struct({
		type: Schema.Literal('gameOver'),
		winner: Schema.NullOr(tribeSchema)
	})
])

const boardPositionSchema = Schema.Struct({
	q_idx: Schema.Finite.pipe(Schema.check(Schema.isInt())),
	r_idx: Schema.Finite.pipe(Schema.check(Schema.isInt()))
})

const chronicleEntrySchema = Schema.Union([
	Schema.Struct({
		kind: Schema.Literal('researchProgress'),
		actorTribe: tribeSchema,
		tech: techSchema,
		turnsRemaining: nonNegativeIntSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('researchCompleted'),
		actorTribe: tribeSchema,
		tech: techSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('villageCaptured'),
		actorTribe: tribeSchema,
		targetTribe: Schema.NullOr(tribeSchema),
		position: boardPositionSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('villageLevelUp'),
		actorTribe: tribeSchema,
		levelUps: nonNegativeIntSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('unitDefeated'),
		actorTribe: tribeSchema,
		targetTribe: tribeSchema,
		position: boardPositionSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('turnAdvanced'),
		actorTribe: tribeSchema,
		turn: nonNegativeIntSchema
	}),
	Schema.Struct({
		kind: Schema.Literal('gameOver'),
		actorTribe: Schema.NullOr(tribeSchema),
		turn: nonNegativeIntSchema
	})
])

const clientMessageOptions = [
	Schema.Struct({ type: Schema.Literal('action'), action: gameActionSchema }),
	Schema.Struct({
		type: Schema.Literal('actionRequest'),
		action: wireActionIntentSchema
	}),
	Schema.Struct({
		type: Schema.Literal('endTurn')
	}),
	Schema.Struct({ type: Schema.Literal('setTribe'), tribe: tribeSchema }),
	Schema.Struct({ type: Schema.Literal('setReady'), ready: Schema.Boolean }),
	Schema.Struct({ type: Schema.Literal('startGame') }),
	Schema.Struct({
		type: Schema.Literal('configureLobby'),
		config: partialLobbyConfigSchema
	}),
	Schema.Struct({
		type: Schema.Literal('setSlotBot'),
		slotIndex: Schema.Finite.pipe(Schema.check(Schema.isInt())),
		isBot: Schema.Boolean,
		difficulty: Schema.optionalKey(difficultySchema)
	})
] as const

const serverMessageOptions = [
	Schema.Struct({
		type: Schema.Literal('lobbyUpdate'),
		lobby: lobbyStateSchema
	}),
	Schema.Struct({ type: Schema.Literal('gameStart'), matchId: Schema.String }),
	Schema.Struct({
		type: Schema.Literal('gameState'),
		state: filteredGameStateSchema,
		currentTurn: tribeSchema,
		turnEndsAt: Schema.NullOr(Schema.Finite),
		viewer: tribeSchema
	}),
	Schema.Struct({
		type: Schema.Literal('actionResult'),
		success: Schema.Boolean,
		message: Schema.String
	}),
	Schema.Struct({
		type: Schema.Literal('playerForfeited'),
		tribe: tribeSchema,
		username: Schema.String
	}),
	Schema.Struct({
		type: Schema.Literal('gameEnd'),
		result: matchResultSchema
	}),
	Schema.Struct({ type: Schema.Literal('error'), message: Schema.String }),
	Schema.Struct({
		type: Schema.Literal('turnTimerUpdate'),
		turnEndsAt: Schema.Finite
	}),
	Schema.Struct({
		type: Schema.Literal('turnEvents'),
		events: Schema.Array(broadcastEventSchema)
	}),
	Schema.Struct({
		type: Schema.Literal('chronicleEntries'),
		entries: Schema.Array(chronicleEntrySchema)
	}),
	Schema.Struct({
		type: Schema.Literal('achievementsUnlocked'),
		tribe: tribeSchema,
		achievementIds: Schema.Array(Schema.Literals(achievementIds))
	})
] as const

const clientMessageSchema = Schema.Union(clientMessageOptions)
const serverMessageSchema = Schema.Union(serverMessageOptions)
// No explicit `Schema.Codec<ServerWireFrame>` annotation: the encoded side
// legitimately differs from the decoded side (branded ids like `MatchId`
// encode to plain strings). `decodeServerWireFrame`'s declared return type
// pins the decoded side to `ServerWireFrame`.
const serverWireFrameSchema = Schema.Struct({
	protocolVersion: Schema.Finite,
	sequence: Schema.NullOr(Schema.Finite),
	messageId: Schema.NullOr(Schema.String),
	message: serverMessageSchema
})

export const clientMessageTags: ReadonlySet<ClientMessage['type']> = new Set(
	clientMessageOptions.map((opt) => opt.fields.type.literal)
)
export const serverMessageTags: ReadonlySet<ServerMessage['type']> = new Set(
	serverMessageOptions.map((opt) => opt.fields.type.literal)
)

const encodeClient = Schema.encodeSync(clientMessageSchema)
const encodeServer = Schema.encodeSync(serverMessageSchema)
const decodeClient = Schema.decodeUnknownResult(clientMessageSchema)
const decodeServerFrame = Schema.decodeUnknownResult(serverWireFrameSchema)

export function encodeClientMessage(msg: ClientMessage): string {
	return JSON.stringify(encodeClient(msg))
}

export function encodeServerMessage(msg: ServerMessage): string {
	return JSON.stringify(encodeServer(msg))
}

export function encodeServerWireFrame(args: {
	sequence: number | null
	messageId: string | null
	message: ServerMessage
}): string {
	return JSON.stringify({
		protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
		sequence: args.sequence,
		messageId: args.messageId,
		message: encodeServer(args.message)
	})
}

export function decodeClientMessage(
	raw: string
): Result.Result<ClientMessage, WireDecodeError> {
	return decodeWith(decodeClient, raw)
}

export function decodeServerMessage(
	raw: string
): Result.Result<ServerMessage, WireDecodeError> {
	const decoded = decodeServerWireFrame(raw)
	if (Result.isFailure(decoded)) {
		return Result.fail(decoded.failure)
	}
	return Result.succeed(decoded.success.message)
}

export function decodeServerWireFrame(
	raw: string
): Result.Result<ServerWireFrame, WireDecodeError> {
	const json = parseJsonObject(raw)
	if (Result.isFailure(json)) {
		return Result.fail(json.failure)
	}

	if (!('protocolVersion' in json.success)) {
		return Result.fail(
			new WireDecodeError({
				message: 'Server wire frame missing protocolVersion',
				raw
			})
		)
	}

	const decoded = decodeServerFrame(json.success)
	if (Result.isFailure(decoded)) {
		return Result.fail(
			new WireDecodeError({
				message: String(decoded.failure),
				raw,
				cause: decoded.failure
			})
		)
	}
	if (decoded.success.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
		return Result.fail(
			new WireDecodeError({
				message: `Unsupported protocol version: ${decoded.success.protocolVersion}`,
				raw
			})
		)
	}
	return Result.succeed(decoded.success)
}

function parseJsonObject(
	raw: string
): // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- raw JSON object is validated by the message schema before domain use
Result.Result<Record<string, unknown>, WireDecodeError> {
	let json: unknown
	try {
		json = JSON.parse(raw)
	} catch (cause) {
		return Result.fail(
			new WireDecodeError({
				message: 'Invalid JSON',
				raw,
				cause
			})
		)
	}
	if (!isJsonObject(json)) {
		return Result.fail(
			new WireDecodeError({ message: 'Message must be an object', raw })
		)
	}
	return Result.succeed(json)
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- this guard establishes only the object boundary before schema decoding
function isJsonObject(value: unknown): value is Record<string, unknown> {
	return Predicate.isObject(value)
}

function decodeWith<T>(
	decode: (input: unknown) => Result.Result<T, unknown>,
	raw: string
): Result.Result<T, WireDecodeError> {
	let json: unknown
	try {
		json = JSON.parse(raw)
	} catch (cause) {
		return Result.fail(
			new WireDecodeError({
				message: 'Invalid JSON',
				raw,
				cause
			})
		)
	}
	if (!Predicate.isObject(json)) {
		return Result.fail(
			new WireDecodeError({ message: 'Message must be an object', raw })
		)
	}
	if (!('type' in json) || !Predicate.isString(json.type)) {
		return Result.fail(
			new WireDecodeError({ message: 'Missing message type', raw })
		)
	}
	const parsed = decode(json)
	if (Result.isFailure(parsed)) {
		return Result.fail(
			new WireDecodeError({
				message: String(parsed.failure),
				raw,
				cause: parsed.failure
			})
		)
	}
	return Result.succeed(parsed.success)
}
