import { Result, Schema } from 'effect'
import { difficulties } from '../difficulty'
import { tribes } from '../domains/tribe'
import { mapSizes, type MatchConfig } from '../multiplayer/types'

export type MatchId = string

const LobbyConfigSchema = Schema.Struct({
	mapSize: Schema.Literals(mapSizes),
	maxPlayers: Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThan(0))
	),
	turnTimerSeconds: Schema.NullOr(Schema.Finite)
})

const LobbySlotRowSchema = Schema.Struct({
	slotIndex: Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
	),
	playerId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
	username: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
	tribe: Schema.Literals(tribes),
	isBot: Schema.Boolean,
	botDifficulty: Schema.Literals(difficulties)
})
const LobbySnapshotSchema = Schema.Struct({
	lobbyId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
	kind: Schema.optional(Schema.Literals(['private', 'publicQueue'])),
	config: LobbyConfigSchema,
	slots: Schema.Array(LobbySlotRowSchema).pipe(
		Schema.check(Schema.isMinLength(1))
	)
})
export type LobbySnapshot = typeof LobbySnapshotSchema.Type

export type MatchInitOutcome =
	| { status: 'started'; matchId: MatchId }
	| { status: 'already-started'; matchId: MatchId }
	| { status: 'invalid'; issues: readonly string[] }
	| { status: 'transient'; retryAfterMs: number }
	| { status: 'permanent'; reason: string }

const decodeSnapshot = Schema.decodeUnknownResult(LobbySnapshotSchema)

/**
 * Validates a candidate snapshot. On success returns the parsed value; on
 * failure returns a list of formatted issue strings.
 */
export const parseLobbySnapshot = (
	input: unknown
): Result.Result<LobbySnapshot, readonly string[]> =>
	decodeSnapshot(input).pipe(Result.mapError(formatSchemaIssue))

const formatSchemaIssue = (issue: Schema.SchemaError): readonly string[] => {
	const message = String(issue)
	const lines = message.split('\n').filter((line) => line.trim().length > 0)
	return lines.length > 0 ? lines : ['Invalid input']
}

/**
 * Port that crosses the Lobby→Match seam. The contract is:
 *
 * - Caller holds the lobby lock when invoking {@link startMatch}.
 * - On `started` | `already-started`, the caller MUST delete the lobby.
 * - On any other outcome, the lobby MUST remain so the user can retry or see
 *   the error.
 *
 * The outcome union is intentionally not collapsed: TypeScript exhaustiveness
 * is the mechanism that keeps lobbies from being orphaned after init failure.
 */
export interface MatchInitializer {
	startMatch(
		snapshot: LobbySnapshot,
		idempotencyKey: string
	): Promise<MatchInitOutcome>
}

/** Deterministic slot-order mapping from a validated snapshot to MatchConfig. */
export function snapshotToMatchConfig(snapshot: LobbySnapshot): MatchConfig {
	const sorted = [...snapshot.slots].toSorted(
		(a, b) => a.slotIndex - b.slotIndex
	)
	const config: MatchConfig = {
		mapSize: snapshot.config.mapSize,
		turnTimerSeconds: snapshot.config.turnTimerSeconds,
		players: sorted.map((slot) => ({
			playerId: slot.playerId,
			username: slot.username,
			tribe: slot.tribe,
			isBot: slot.isBot,
			botDifficulty: slot.botDifficulty
		}))
	}
	if (snapshot.kind !== undefined) {
		config.kind = snapshot.kind
	}
	return config
}
