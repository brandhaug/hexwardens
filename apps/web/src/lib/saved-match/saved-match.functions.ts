import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq, sql } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { savedMatches, type NewSavedMatchRow } from '@hexwardens/db/schema'
import {
	isSavedMatchRecord,
	type SavedMatchRecord
} from '@hexwardens/game-logic/match/saved-match'
import { currentSession } from '@/lib/auth.server'
import { runWithServerContext } from '@/lib/server-context'
import { ServerContextTag } from '@/lib/server-context-tag'

// Single-player MatchState snapshots for our largest boards live well under
// 256 KiB; D1's row limit is 1 MiB. Reject anything beyond this size so an
// authenticated client can't fill the user's slot with arbitrary blobs.
const MAX_SAVED_MATCH_BYTES = 256 * 1024

export type RemoteSavedMatchRead =
	| { readonly status: 'anonymous'; readonly record: null }
	| { readonly status: 'ok'; readonly record: SavedMatchRecord | null }

export type RemoteSavedMatchWrite =
	| { readonly status: 'anonymous' }
	| { readonly status: 'ok'; readonly record: SavedMatchRecord }
	| { readonly status: 'conflict'; readonly remote: SavedMatchRecord | null }

const getRemoteSavedMatchEffect = Effect.fn('SavedMatch.getRemote')(
	function* () {
		const ctx = yield* ServerContextTag
		const session = yield* currentSession()
		if (!session?.user) {
			return {
				status: 'anonymous',
				record: null
			} as const satisfies RemoteSavedMatchRead
		}
		const row = yield* Effect.promise(() =>
			ctx
				.db()
				.select({ payload: savedMatches.payload })
				.from(savedMatches)
				.where(eq(savedMatches.userId, session.user.id))
				.get()
		)
		// Drizzle's `$type<SavedMatchRecord>()` is an assertion, not a runtime
		// guard. Revalidate on read so a row written under an older shape
		// fails closed (resume prompt → "incompatible") instead of crashing
		// deep in the dispatch pipeline.
		const payload = row?.payload ?? null
		return {
			status: 'ok',
			record: payload && isSavedMatchRecord(payload) ? payload : null
		} as const satisfies RemoteSavedMatchRead
	}
)

const putRemoteSavedMatchEffect = Effect.fn('SavedMatch.putRemote')(function* (
	data: SavedMatchRecord
) {
	const ctx = yield* ServerContextTag
	const session = yield* currentSession()
	if (!session?.user) {
		return { status: 'anonymous' } as const satisfies RemoteSavedMatchWrite
	}
	const userId = session.user.id
	const row = rowFromRecord(userId, data)

	// Conditional upsert: insert succeeds when no row exists; ON CONFLICT
	// fires when a row already exists for this user, and the WHERE clause
	// closes the TOCTOU window — the UPDATE only takes effect if the stored
	// `revision` still matches `data.baseRevision`. `sql\`0 = 1\`` for the
	// "expected no row but got one" case forces the conflict resolution to
	// no-op, so a second concurrent insert is correctly rejected.
	const updateWhere =
		data.baseRevision === null
			? sql`0 = 1`
			: eq(savedMatches.revision, data.baseRevision)
	const [written] = yield* Effect.promise(() =>
		ctx
			.db()
			.insert(savedMatches)
			.values(row)
			.onConflictDoUpdate({
				target: savedMatches.userId,
				set: row,
				setWhere: updateWhere
			})
			.returning({ revision: savedMatches.revision })
			.all()
	)

	if (written?.revision === data.revision) {
		return {
			status: 'ok',
			record: data
		} as const satisfies RemoteSavedMatchWrite
	}

	// Conditional update no-op'd because another writer raced us or the
	// caller's `baseRevision` was stale. Re-fetch the current remote so the
	// client can resolve divergence.
	const current = yield* Effect.promise(() =>
		ctx
			.db()
			.select({ payload: savedMatches.payload })
			.from(savedMatches)
			.where(eq(savedMatches.userId, userId))
			.get()
	)
	const remote = current?.payload ?? null
	return {
		status: 'conflict',
		remote: remote && isSavedMatchRecord(remote) ? remote : null
	} as const satisfies RemoteSavedMatchWrite
})

class SavedMatchPayloadError extends Schema.TaggedError<SavedMatchPayloadError>()(
	'SavedMatchPayloadError',
	{ message: Schema.String }
) {}

const validateSavedMatch = Effect.fn('SavedMatch.validate')(function* (
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the server-function payload decoder.
	data: unknown
) {
	if (!isSavedMatchRecord(data)) {
		return yield* new SavedMatchPayloadError({
			message: 'Invalid Saved Match payload'
		})
	}
	if (JSON.stringify(data).length > MAX_SAVED_MATCH_BYTES) {
		return yield* new SavedMatchPayloadError({
			message: 'Saved Match payload too large'
		})
	}
	return data
})

export const getRemoteSavedMatch = createServerFn({ method: 'GET' }).handler(
	(): Promise<RemoteSavedMatchRead> =>
		runWithServerContext(getRequest(), getRemoteSavedMatchEffect())
)

export const putRemoteSavedMatch = createServerFn({ method: 'POST' })
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Start validators decode untrusted server-function payloads.
	.validator((data: unknown) => Effect.runPromise(validateSavedMatch(data)))
	.handler(({ data }): Promise<RemoteSavedMatchWrite> =>
		runWithServerContext(getRequest(), putRemoteSavedMatchEffect(data))
	)

function rowFromRecord(
	userId: string,
	record: SavedMatchRecord
): NewSavedMatchRow {
	return {
		userId,
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
		updatedAt: record.updatedAt,
		payload: record
	}
}
