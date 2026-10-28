import { Result, Schema } from 'effect'
import { difficulties, type Difficulty } from '../difficulty'
import { tribes, type Tribe } from '../domains/tribe'
import { mapSizes, type MapSize } from '../multiplayer/types'
import { type MatchState } from './types'

export const SAVED_MATCH_SCHEMA_VERSION = 1

/**
 * Bumped when `MatchState`'s in-memory shape changes in a way that makes
 * older stored snapshots unsafe to resume. Distinct from
 * {@link SAVED_MATCH_SCHEMA_VERSION}, which versions the outer record envelope.
 */
export const SAVED_MATCH_GAME_LOGIC_VERSION = 'normalized-match-v4'

export const savedMatchStatuses = ['active', 'completed', 'deleted'] as const
export type SavedMatchStatus = (typeof savedMatchStatuses)[number]

export type SavedMatchMetadata = {
	readonly savedMatchId: string
	readonly revision: number
	readonly baseRevision: number | null
	readonly status: SavedMatchStatus
	readonly schemaVersion: number
	readonly gameLogicVersion: string
	readonly playerTribe: Tribe
	readonly mapSize: MapSize
	readonly opponentCount: number
	readonly difficulty: Difficulty
	readonly turn: number
	readonly winner: Tribe | null
	readonly updatedAt: string
}

export type SavedMatchRevision = SavedMatchMetadata & {
	readonly status: 'active' | 'completed'
	readonly matchState: MatchState
}

export type DeletedSavedMatchRevision = SavedMatchMetadata & {
	readonly status: 'deleted'
	readonly matchState: null
}

export type SavedMatchRecord = SavedMatchRevision | DeletedSavedMatchRevision

export type SavedMatchSyncResolution =
	| { readonly kind: 'empty' }
	| { readonly kind: 'in-sync'; readonly record: SavedMatchRecord }
	| { readonly kind: 'use-local'; readonly record: SavedMatchRecord }
	| { readonly kind: 'use-remote'; readonly record: SavedMatchRecord }
	| {
			readonly kind: 'diverged'
			readonly local: SavedMatchRecord
			readonly remote: SavedMatchRecord
			readonly recommended: 'local' | 'remote'
	  }

export type SavedMatchContinueValidation =
	| { readonly ok: true; readonly record: SavedMatchRevision }
	| {
			readonly ok: false
			readonly reason:
				| 'deleted'
				| 'unsupported_schema'
				| 'unsupported_game_logic'
				| 'missing_snapshot'
	  }

export type ValidateSavedMatchOptions = {
	/**
	 * When supplied, reject revisions whose stored `gameLogicVersion` does not
	 * match this expected version. Bumping it is how we fail closed on
	 * incompatible `MatchState` shape changes — without it, an older snapshot
	 * would resume against fresh code and crash deep in the dispatch pipeline.
	 */
	readonly expectedGameLogicVersion?: string
}

export type CreateSavedMatchRevisionArgs = {
	readonly savedMatchId: string
	readonly matchState: MatchState
	readonly playerTribe: Tribe
	/**
	 * Difficulty surfaced to the player on the continue prompt. The caller
	 * supplies it explicitly so single-player Match metadata derivation does
	 * not silently pick the first bot's difficulty as a proxy for the
	 * Saved Match.
	 */
	readonly difficulty: Difficulty
	/**
	 * Opponent count surfaced to the player on the continue prompt. Caller-
	 * supplied for the same reason as {@link difficulty} — `players.length - 1`
	 * encodes a "one human" assumption that does not belong inside game-logic.
	 */
	readonly opponentCount: number
	readonly updatedAt: string
	readonly gameLogicVersion: string
	readonly previous?: SavedMatchRecord | null
}

export type MarkSavedMatchDeletedArgs = {
	readonly previous: SavedMatchRecord
	readonly updatedAt: string
}

export function createSavedMatchRevision(
	args: CreateSavedMatchRevisionArgs
): SavedMatchRevision {
	return {
		savedMatchId: args.savedMatchId,
		revision: nextRevision(args.previous),
		baseRevision: args.previous?.revision ?? null,
		status: args.matchState.gameState.isGameOver ? 'completed' : 'active',
		schemaVersion: SAVED_MATCH_SCHEMA_VERSION,
		gameLogicVersion: args.gameLogicVersion,
		playerTribe: args.playerTribe,
		mapSize: args.matchState.config.mapSize,
		opponentCount: args.opponentCount,
		difficulty: args.difficulty,
		turn: args.matchState.gameState.turn,
		winner: args.matchState.gameState.winner,
		updatedAt: args.updatedAt,
		matchState: args.matchState
	}
}

export function markSavedMatchDeleted(
	args: MarkSavedMatchDeletedArgs
): DeletedSavedMatchRevision {
	return {
		...metadataFrom(args.previous),
		revision: args.previous.revision + 1,
		baseRevision: args.previous.revision,
		status: 'deleted',
		updatedAt: args.updatedAt,
		matchState: null
	}
}

export function resolveSavedMatchSync(
	local: SavedMatchRecord | null,
	remote: SavedMatchRecord | null
): SavedMatchSyncResolution {
	if (!local && !remote) {
		return { kind: 'empty' }
	}
	if (local && !remote) {
		return { kind: 'use-local', record: local }
	}
	if (!local && remote) {
		return { kind: 'use-remote', record: remote }
	}
	if (!local || !remote) {
		return { kind: 'empty' }
	}

	if (sameRevision(local, remote)) {
		return { kind: 'in-sync', record: newerOf(local, remote) }
	}
	if (isBasedOn(local, remote)) {
		return { kind: 'use-local', record: local }
	}
	if (isBasedOn(remote, local)) {
		return { kind: 'use-remote', record: remote }
	}
	return {
		kind: 'diverged',
		local,
		remote,
		recommended: newerOf(local, remote) === local ? 'local' : 'remote'
	}
}

export function validateSavedMatchForContinue(
	record: SavedMatchRecord,
	options: ValidateSavedMatchOptions = {}
): SavedMatchContinueValidation {
	if (record.status === 'deleted') {
		return { ok: false, reason: 'deleted' }
	}
	if (record.schemaVersion !== SAVED_MATCH_SCHEMA_VERSION) {
		return { ok: false, reason: 'unsupported_schema' }
	}
	if (
		options.expectedGameLogicVersion !== undefined &&
		record.gameLogicVersion !== options.expectedGameLogicVersion &&
		!(
			options.expectedGameLogicVersion === SAVED_MATCH_GAME_LOGIC_VERSION &&
			record.gameLogicVersion === 'normalized-xstate-v3'
		)
	) {
		return { ok: false, reason: 'unsupported_game_logic' }
	}
	return { ok: true, record }
}

export type RebaseSavedMatchArgs = {
	/** The revision the Player chose to keep during divergence resolution. */
	readonly chosen: SavedMatchRecord
	/**
	 * The revision being overwritten. The result's `baseRevision` is set to
	 * `loser.revision` so the server's `baseRevision === remote.revision`
	 * check accepts the write that lands the resolution.
	 */
	readonly loser: SavedMatchRecord
	readonly updatedAt: string
}

/**
 * Restamp `chosen` so it cleanly succeeds `loser` in revision order. Used by
 * the divergence prompt: a naive PUT of `chosen` would fail the server's base-
 * revision check (its `baseRevision` points to the common ancestor, not to
 * `loser.revision`), and the conflict would loop forever.
 */
export function rebaseSavedMatchOnto(
	args: RebaseSavedMatchArgs
): SavedMatchRecord {
	if (args.chosen.status === 'deleted') {
		return {
			...args.chosen,
			revision: args.loser.revision + 1,
			baseRevision: args.loser.revision,
			updatedAt: args.updatedAt
		}
	}
	return {
		...args.chosen,
		revision: args.loser.revision + 1,
		baseRevision: args.loser.revision,
		updatedAt: args.updatedAt
	}
}

// `matchState` is treated as an opaque object — the schema only validates the
// metadata envelope. `validateSavedMatchForContinue` checks `schemaVersion`
// before any consumer trusts the inner snapshot.
const matchStateOpaque = Schema.Record(Schema.String, Schema.Unknown)

const metadataFields = {
	savedMatchId: Schema.String,
	revision: Schema.Finite,
	baseRevision: Schema.NullOr(Schema.Finite),
	schemaVersion: Schema.Finite,
	gameLogicVersion: Schema.String,
	playerTribe: Schema.Literals(tribes),
	mapSize: Schema.Literals(mapSizes),
	opponentCount: Schema.Finite,
	difficulty: Schema.Literals(difficulties),
	turn: Schema.Finite,
	winner: Schema.NullOr(Schema.Literals(tribes)),
	updatedAt: Schema.String
}

const SavedMatchRecordSchema = Schema.Union([
	Schema.Struct({
		...metadataFields,
		status: Schema.Literals(['active', 'completed'] as const),
		matchState: matchStateOpaque
	}),
	Schema.Struct({
		...metadataFields,
		status: Schema.Literal('deleted'),
		matchState: Schema.Null
	})
])

const decodeSavedMatchRecord = Schema.decodeUnknownResult(
	SavedMatchRecordSchema
)

export function isSavedMatchRecord(value: unknown): value is SavedMatchRecord {
	return Result.isSuccess(decodeSavedMatchRecord(value))
}

function metadataFrom(record: SavedMatchRecord): SavedMatchMetadata {
	return {
		savedMatchId: record.savedMatchId,
		revision: record.revision,
		baseRevision: record.baseRevision,
		status: record.status,
		schemaVersion: record.schemaVersion,
		gameLogicVersion: record.gameLogicVersion,
		playerTribe: record.playerTribe,
		mapSize: record.mapSize,
		opponentCount: record.opponentCount,
		difficulty: record.difficulty,
		turn: record.turn,
		winner: record.winner,
		updatedAt: record.updatedAt
	}
}

function nextRevision(previous: SavedMatchRecord | null | undefined): number {
	return previous ? previous.revision + 1 : 1
}

function sameRevision(
	local: SavedMatchRecord,
	remote: SavedMatchRecord
): boolean {
	return (
		local.savedMatchId === remote.savedMatchId &&
		local.revision === remote.revision &&
		local.status === remote.status &&
		local.updatedAt === remote.updatedAt
	)
}

function isBasedOn(
	candidate: SavedMatchRecord,
	base: SavedMatchRecord
): boolean {
	// `>=` (not `===`) so a candidate that already fast-forwarded past `base`
	// — e.g. a local that advanced 2 → 3 → 4 while remote stayed at 1 — still
	// counts as "based on" the older base. Direct continuation (candidate.base
	// === base.revision) and dominance (candidate.base > base.revision) both
	// mean candidate's history strictly extends base's.
	return (
		candidate.savedMatchId === base.savedMatchId &&
		candidate.baseRevision !== null &&
		candidate.baseRevision >= base.revision
	)
}

function newerOf(
	left: SavedMatchRecord,
	right: SavedMatchRecord
): SavedMatchRecord {
	return Date.parse(left.updatedAt) >= Date.parse(right.updatedAt)
		? left
		: right
}
