import { Effect } from 'effect'
import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	createSavedMatchRevision,
	markSavedMatchDeleted,
	rebaseSavedMatchOnto,
	SAVED_MATCH_GAME_LOGIC_VERSION,
	validateSavedMatchForContinue,
	type SavedMatchRecord,
	type SavedMatchRevision
} from '@hexwardens/game-logic/match/saved-match'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import { type SavedMatchStore } from './saved-match-store'
import {
	loadSavedMatchSlot,
	type SavedMatchRemoteWriteResult
} from './saved-match-sync'

export const SAVED_MATCH_REMOTE_DEBOUNCE_MS = 750

/**
 * Remote replica of the Saved Match slot. In production this is the pair of
 * `apps/web` server functions in `saved-match.functions.ts` (D1-backed,
 * login-gated — guests get `anonymous` results and stay local-only). Tests
 * supply fakes. Writes must be revision-checked per ADR-0009: the server
 * accepts a record only when its `baseRevision` still matches the stored
 * revision, otherwise it reports `conflict` with the current remote.
 */
export type SavedMatchRemote = {
	readonly read: () => Promise<SavedMatchRecord | null>
	readonly write: (
		record: SavedMatchRecord
	) => Promise<SavedMatchRemoteWriteResult>
}

export type SavedMatchLifecycleArgs = {
	readonly store: SavedMatchStore
	readonly remote: SavedMatchRemote
	/** Remote replication debounce. Defaults to {@link SAVED_MATCH_REMOTE_DEBOUNCE_MS}. */
	readonly debounceMs?: number
	/** ISO timestamp source — injectable for deterministic tests. */
	readonly now?: () => string
}

export type SavedMatchLoadResult =
	/** No resumable Saved Match anywhere (or only a tombstone). */
	| { readonly kind: 'empty' }
	/** One winning revision, validated as continuable. */
	| { readonly kind: 'ready'; readonly record: SavedMatchRevision }
	/**
	 * Local and remote Saved Match Revisions advanced independently. The
	 * Player must choose which one survives — see {@link SavedMatchLifecycle.resolveConflict}.
	 */
	| {
			readonly kind: 'conflict'
			readonly local: SavedMatchRecord
			readonly remote: SavedMatchRecord
			readonly recommended: 'local' | 'remote'
	  }
	/** A winning revision exists but cannot be resumed under current Match rules. */
	| { readonly kind: 'incompatible'; readonly record: SavedMatchRecord }

export type SavedMatchConflictResolution =
	| { readonly kind: 'ready'; readonly record: SavedMatchRevision }
	/** The remote moved again while resolving — the Player must re-choose. */
	| { readonly kind: 'conflict'; readonly remote: SavedMatchRecord | null }
	| { readonly kind: 'incompatible'; readonly record: SavedMatchRecord }

/** Summary metadata stamped onto every new revision for the continue prompt. */
export type SavedMatchDescriptor = {
	readonly savedMatchId: string
	readonly playerTribe: Tribe
	readonly difficulty: Difficulty
	readonly opponentCount: number
}

export type SavedMatchSessionArgs = {
	/** The revision the session resumes from, or `null` for a fresh Match. */
	readonly initial: SavedMatchRecord | null
	/**
	 * Fired when the remote rejects a debounced write with `conflict`. Callers
	 * surface it to the Player — otherwise remote sync silently breaks for the
	 * rest of the session.
	 */
	readonly onRemoteConflict?: (remote: SavedMatchRecord | null) => void
}

/**
 * Write half of the lifecycle for one live Match. Owns the `latest` revision
 * chain, the local write-after-every-committed-state-change guarantee, the
 * debounced revision-checked remote replication, and the tombstone
 * acknowledgement of completed Matches.
 */
export interface SavedMatchSession {
	/**
	 * Build and persist the next candidate Saved Match Revision. Resolves
	 * only after the local transaction commits (offline durability source);
	 * remote replication is debounced and best-effort. No-ops when the state
	 * is reference-identical to the latest written revision.
	 */
	recordCommittedState(
		matchState: MatchState,
		descriptor: SavedMatchDescriptor
	): Promise<void>
	/**
	 * Stamp the current record as deleted (game-over acknowledgement).
	 * Resolves once the tombstone has been written to both local and remote so
	 * callers can safely navigate away. Per ADR-0009 deletes are tombstone
	 * revisions — acknowledging on one device must prevent an older unfinished
	 * copy from being resurrected on another.
	 */
	acknowledgeDeleted(): Promise<void>
	/**
	 * Fire any pending debounced remote write immediately (tab close /
	 * unmount). Best-effort — the browser may not deliver the request.
	 */
	flushPendingRemote(): void
}

/**
 * The single seam for ADR-0009's Saved Match rules. Owns the full lifecycle —
 * initial local+remote load and merge, divergence surfacing and resolution,
 * and per-Match write sessions — over a platform-neutral {@link SavedMatchStore}
 * and a {@link SavedMatchRemote}. Routes consume this interface (via the
 * hooks in `use-saved-match-lifecycle.ts`); the merge rules in
 * `saved-match-sync.ts`, the store adapters, and the server functions are
 * implementation details behind it.
 */
export interface SavedMatchLifecycle {
	/**
	 * Load local and remote Saved Match Revisions in parallel, merge them by
	 * the ADR-0009 revision rules, and validate the winner for continue.
	 * Side effects mirror the merge: a winning remote is copied into the local
	 * store; a winning local is pushed remotely (revision-checked — a rejected
	 * push surfaces as `conflict`).
	 */
	load(): Promise<SavedMatchLoadResult>
	/**
	 * Land the Player's divergence choice: rebase `chosen` onto `loser` so the
	 * revision-checked remote write succeeds, persist to both stores, and
	 * re-validate for continue.
	 */
	resolveConflict(args: {
		readonly chosen: SavedMatchRecord
		readonly loser: SavedMatchRecord
	}): Promise<SavedMatchConflictResolution>
	/** Open the write session for a live Match. */
	beginSession(args: SavedMatchSessionArgs): SavedMatchSession
}

export function createSavedMatchLifecycle(
	args: SavedMatchLifecycleArgs
): SavedMatchLifecycle {
	const { store, remote } = args
	const debounceMs = args.debounceMs ?? SAVED_MATCH_REMOTE_DEBOUNCE_MS
	const now = args.now ?? (() => new Date().toISOString())

	async function load(): Promise<SavedMatchLoadResult> {
		const slot = await loadSavedMatchSlot({
			store,
			readRemote: remote.read,
			writeRemote: remote.write
		})
		if (slot.kind === 'conflict') {
			return slot
		}
		return validatedResult(slot.record)
	}

	async function resolveConflict(resolution: {
		readonly chosen: SavedMatchRecord
		readonly loser: SavedMatchRecord
	}): Promise<SavedMatchConflictResolution> {
		const rebased = rebaseSavedMatchOnto({
			chosen: resolution.chosen,
			loser: resolution.loser,
			updatedAt: now()
		})
		await store.put(rebased)
		const write = await remote.write(rebased)
		if (write.status === 'conflict') {
			return { kind: 'conflict', remote: write.remote }
		}
		const validated = validatedResult(rebased)
		// A resolution that lands on a tombstone (or an otherwise un-resumable
		// record) is surfaced as `incompatible` — same gate the menu already
		// renders for stale-schema records.
		return validated.kind === 'empty'
			? { kind: 'incompatible', record: rebased }
			: validated
	}

	function beginSession(sessionArgs: SavedMatchSessionArgs): SavedMatchSession {
		let latest: SavedMatchRecord | null = sessionArgs.initial
		let timer: ReturnType<typeof setTimeout> | null = null

		function cancelPendingRemote(): void {
			if (timer !== null) {
				clearTimeout(timer)
				timer = null
			}
		}

		async function dispatchRemote(record: SavedMatchRecord): Promise<void> {
			const result = await remote.write(record)
			if (result.status === 'conflict') {
				sessionArgs.onRemoteConflict?.(result.remote)
			}
		}

		function scheduleRemote(record: SavedMatchRecord): void {
			cancelPendingRemote()
			timer = setTimeout(() => {
				timer = null
				void dispatchRemote(record)
			}, debounceMs)
		}

		return {
			async recordCommittedState(matchState, descriptor) {
				if (latest?.matchState === matchState) {
					return
				}
				const next = createSavedMatchRevision({
					savedMatchId: descriptor.savedMatchId,
					matchState,
					playerTribe: descriptor.playerTribe,
					difficulty: descriptor.difficulty,
					opponentCount: descriptor.opponentCount,
					updatedAt: now(),
					gameLogicVersion: SAVED_MATCH_GAME_LOGIC_VERSION,
					previous: latest
				})
				await store.put(next)
				latest = next
				scheduleRemote(next)
			},
			async acknowledgeDeleted() {
				const previous = latest
				if (!previous) {
					return
				}
				// Flush any debounced write of `previous` before sending the
				// tombstone: the tombstone's `baseRevision = previous.revision`, so
				// the server's `baseRevision === remote.revision` check only passes
				// if `previous` has actually landed remotely. Skipping the flush
				// leaves the server at an older revision, the tombstone fails as
				// conflict, and a second device can later resurrect the completed
				// Match — breaking ADR-0009.
				const hadPending = timer !== null
				cancelPendingRemote()
				if (hadPending) {
					await dispatchRemote(previous)
				}
				const deleted = markSavedMatchDeleted({
					previous,
					updatedAt: now()
				})
				latest = deleted
				await Effect.runPromise(
					Effect.all(
						[
							Effect.promise(() => store.put(deleted)),
							Effect.promise(() => dispatchRemote(deleted))
						],
						{ concurrency: 'unbounded' }
					)
				)
			},
			flushPendingRemote() {
				if (timer === null) {
					return
				}
				cancelPendingRemote()
				const record = latest
				if (record) {
					void dispatchRemote(record)
				}
			}
		}
	}

	return { load, resolveConflict, beginSession }
}

function validatedResult(
	record: SavedMatchRecord | null
): Exclude<SavedMatchLoadResult, { kind: 'conflict' }> {
	if (!record) {
		return { kind: 'empty' }
	}
	const validation = validateSavedMatchForContinue(record, {
		expectedGameLogicVersion: SAVED_MATCH_GAME_LOGIC_VERSION
	})
	if (!validation.ok) {
		// `deleted` means the slot is occupied by an acknowledged tombstone —
		// that is "nothing to continue", not an incompatibility to surface.
		return validation.reason === 'deleted'
			? { kind: 'empty' }
			: { kind: 'incompatible', record }
	}
	return { kind: 'ready', record: validation.record }
}
