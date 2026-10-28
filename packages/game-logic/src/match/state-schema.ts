import { Schema } from 'effect'
import { difficulties } from '../difficulty'
import { techs } from '../domains/tech'
import { tribes } from '../domains/tribe'
import { getWorldSchemas, decodeGameSnapshot } from '../engine/world-schema'
import { mapSizes } from '../multiplayer/types'
import { type MatchState } from './types'

function defineMatchStateSchema() {
	const tribe = Schema.Literals(tribes)
	const integer = Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
	)
	const position = Schema.Struct({ q_idx: integer, r_idx: integer })
	const entry = { seq: integer, turn: integer, actorTribe: tribe }
	const chronicleEntry = Schema.Union([
		Schema.Struct({
			...entry,
			kind: Schema.Literal('researchProgress'),
			tech: Schema.Literals(techs),
			turnsRemaining: integer
		}),
		Schema.Struct({
			...entry,
			kind: Schema.Literal('researchCompleted'),
			tech: Schema.Literals(techs)
		}),
		Schema.Struct({
			...entry,
			kind: Schema.Literal('villageCaptured'),
			targetTribe: Schema.NullOr(tribe),
			position
		}),
		Schema.Struct({
			...entry,
			kind: Schema.Literal('villageLevelUp'),
			levelUps: integer
		}),
		Schema.Struct({
			...entry,
			kind: Schema.Literal('unitDefeated'),
			targetTribe: tribe,
			position
		}),
		Schema.Struct({ ...entry, kind: Schema.Literal('turnAdvanced') }),
		Schema.Struct({
			...entry,
			kind: Schema.Literal('gameOver'),
			actorTribe: Schema.NullOr(tribe)
		})
	])
	return Schema.Struct({
		execution: Schema.optionalKey(
			Schema.Literals(['bot-running', 'cleanup-pending'])
		),
		matchId: Schema.String,
		gameState: getWorldSchemas().gameSnapshotSchema,
		config: Schema.Struct({
			mapSize: Schema.Literals(mapSizes),
			turnTimerSeconds: Schema.NullOr(Schema.Finite),
			players: Schema.mutable(
				Schema.Array(
					Schema.Struct({
						playerId: Schema.String,
						username: Schema.String,
						tribe,
						isBot: Schema.Boolean,
						botDifficulty: Schema.Literals(difficulties)
					})
				)
			),
			kind: Schema.optionalKey(Schema.Literals(['private', 'publicQueue'])),
			seed: Schema.optionalKey(Schema.Finite)
		}),
		startedAt: Schema.Finite,
		dailyDate: Schema.String,
		playerIdToTribe: Schema.Record(Schema.String, tribe),
		turnSchedule: Schema.NullOr(
			Schema.Struct({
				kind: Schema.Literals(['human', 'bot']),
				deadline: Schema.Finite
			})
		),
		cleanupDeadline: Schema.NullOr(Schema.Finite),
		disconnectedPlayers: Schema.Record(
			Schema.String,
			Schema.Struct({ tribe, username: Schema.String, deadline: Schema.Finite })
		),
		connectionCount: integer,
		chronicle: Schema.optionalKey(
			Schema.Struct({ entries: Schema.Array(chronicleEntry), nextSeq: integer })
		),
		forfeitedTribes: Schema.optionalKey(Schema.mutable(Schema.Array(tribe)))
	})
}

let schema: ReturnType<typeof defineMatchStateSchema> | undefined

export function matchStateSchema() {
	schema ??= defineMatchStateSchema()
	return schema
}

/** Structural and relational validation for host-loaded match checkpoints. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- persisted state is untrusted at this decoder boundary
export function decodePersistedMatchState(value: unknown): MatchState {
	const decoded = Schema.decodeUnknownSync(matchStateSchema())(value)
	return { ...decoded, gameState: decodeGameSnapshot(decoded.gameState) }
}
