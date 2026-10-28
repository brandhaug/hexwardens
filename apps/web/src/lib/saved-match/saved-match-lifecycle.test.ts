import { Result } from 'effect'
import { createInitialMatchState } from '@hexwardens/game-logic/match/init'
import {
	SAVED_MATCH_GAME_LOGIC_VERSION,
	type SavedMatchRecord,
	type SavedMatchRevision
} from '@hexwardens/game-logic/match/saved-match'
import { humanVsBotConfig } from '@hexwardens/game-logic/match/test-helpers'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import {
	createSavedMatchLifecycle,
	SAVED_MATCH_REMOTE_DEBOUNCE_MS,
	type SavedMatchRemote
} from './saved-match-lifecycle'
import { createMemorySavedMatchStore } from './saved-match-store'
import { type SavedMatchRemoteWriteResult } from './saved-match-sync'

/**
 * Unit tests for the Saved Match lifecycle seam (ADR-0009) against a fake
 * local store and a fake revision-checked remote — no route, no React, no
 * server functions. The remote fake mimics the server function's conditional
 * upsert: a write lands only when no remote row exists or the record's
 * `baseRevision` matches the stored revision; otherwise it answers
 * `conflict` with the current remote.
 */

type FakeRemote = SavedMatchRemote & {
	readonly writes: SavedMatchRecord[]
	current(): SavedMatchRecord | null
}

function revisionCheckedRemote(
	initial: SavedMatchRecord | null = null
): FakeRemote {
	let current = initial
	const writes: SavedMatchRecord[] = []
	return {
		writes,
		current: () => current,
		read: () => Promise.resolve(current),
		write: (record: SavedMatchRecord): Promise<SavedMatchRemoteWriteResult> => {
			writes.push(record)
			if (current === null || record.baseRevision === current.revision) {
				current = record
				return Promise.resolve({ status: 'ok', record } as const)
			}
			return Promise.resolve({ status: 'conflict', remote: current } as const)
		}
	}
}

function buildMatchState(): MatchState {
	const result = createInitialMatchState(
		'saved-match-lifecycle-test',
		{ ...humanVsBotConfig(), seed: 7 },
		1_700_000_000
	)
	if (Result.isFailure(result)) {
		throw result.failure
	}
	return result.success
}

const baseMatchState = buildMatchState()

function activeRevision(args: {
	readonly revision: number
	readonly baseRevision: number | null
	readonly updatedAt: string
	readonly matchState?: MatchState
}): SavedMatchRevision {
	return {
		savedMatchId: 'saved-1',
		revision: args.revision,
		baseRevision: args.baseRevision,
		status: 'active',
		schemaVersion: 1,
		gameLogicVersion: SAVED_MATCH_GAME_LOGIC_VERSION,
		playerTribe: 'barbarians',
		mapSize: 'small',
		opponentCount: 1,
		difficulty: 'Beginner',
		turn: 1,
		winner: null,
		updatedAt: args.updatedAt,
		matchState: args.matchState ?? baseMatchState
	}
}

const descriptor = {
	savedMatchId: 'saved-1',
	playerTribe: 'barbarians',
	difficulty: 'Beginner',
	opponentCount: 1
} as const

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve()
	await Promise.resolve()
}

describe('SavedMatchLifecycle.load', () => {
	it('rejects failed local commits without advancing the revision or replicating remotely', async () => {
		const memory = createMemorySavedMatchStore()
		const remote = revisionCheckedRemote()
		let fail = true
		const lifecycle = createSavedMatchLifecycle({
			store: {
				...memory,
				put: (record) =>
					fail ? Promise.reject(new Error('quota')) : memory.put(record)
			},
			remote
		})
		const session = lifecycle.beginSession({ initial: null })
		await expect(
			session.recordCommittedState(baseMatchState, descriptor)
		).rejects.toThrow('quota')
		expect(remote.writes).toHaveLength(0)
		fail = false
		await session.recordCommittedState(baseMatchState, descriptor)
		session.flushPendingRemote()
		await flushMicrotasks()
		expect(remote.writes[0]?.revision).toBe(1)
	})

	it('reports empty on a fresh start (no local, no remote)', async () => {
		const lifecycle = createSavedMatchLifecycle({
			store: createMemorySavedMatchStore(),
			remote: revisionCheckedRemote()
		})

		await expect(lifecycle.load()).resolves.toEqual({ kind: 'empty' })
	})

	it('continues the newer local revision and replicates it remotely', async () => {
		const local = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:05:00.000Z'
		})
		const remote = revisionCheckedRemote(
			activeRevision({
				revision: 1,
				baseRevision: null,
				updatedAt: '2026-06-01T12:00:00.000Z'
			})
		)
		const lifecycle = createSavedMatchLifecycle({
			store: createMemorySavedMatchStore(local),
			remote
		})

		const result = await lifecycle.load()

		expect(result).toEqual({ kind: 'ready', record: local })
		// The winning local must land remotely via the revision-checked write.
		expect(remote.current()).toEqual(local)
	})

	it('continues the newer remote revision and copies it into the local store', async () => {
		const remoteRecord = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:05:00.000Z'
		})
		const store = createMemorySavedMatchStore(
			activeRevision({
				revision: 1,
				baseRevision: null,
				updatedAt: '2026-06-01T12:00:00.000Z'
			})
		)
		const lifecycle = createSavedMatchLifecycle({
			store,
			remote: revisionCheckedRemote(remoteRecord)
		})

		const result = await lifecycle.load()

		expect(result).toEqual({ kind: 'ready', record: remoteRecord })
		await expect(store.get()).resolves.toEqual(remoteRecord)
	})

	it('surfaces divergence as a conflict carrying both revisions', async () => {
		const local = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:10:00.000Z'
		})
		const remoteRecord = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:05:00.000Z'
		})
		const lifecycle = createSavedMatchLifecycle({
			store: createMemorySavedMatchStore(local),
			remote: revisionCheckedRemote(remoteRecord)
		})

		await expect(lifecycle.load()).resolves.toEqual({
			kind: 'conflict',
			local,
			remote: remoteRecord,
			recommended: 'local'
		})
	})
})

describe('SavedMatchSession', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('writes every committed state change locally and coalesces remote writes through the debounce', async () => {
		const store = createMemorySavedMatchStore()
		const remote = revisionCheckedRemote()
		const lifecycle = createSavedMatchLifecycle({ store, remote })
		const session = lifecycle.beginSession({ initial: null })

		const first = { ...baseMatchState }
		const second = { ...baseMatchState }
		await session.recordCommittedState(first, descriptor)
		// Same reference again — must not mint a new revision.
		await session.recordCommittedState(first, descriptor)
		await vi.advanceTimersByTimeAsync(SAVED_MATCH_REMOTE_DEBOUNCE_MS - 1)
		await session.recordCommittedState(second, descriptor)
		await flushMicrotasks()

		// Local durability is immediate: the store already holds revision 2.
		const localRecord = await store.get()
		expect(localRecord?.revision).toBe(2)
		expect(localRecord?.baseRevision).toBe(1)
		// Remote is still quiet — the second write reset the debounce window.
		expect(remote.writes).toHaveLength(0)

		await vi.advanceTimersByTimeAsync(SAVED_MATCH_REMOTE_DEBOUNCE_MS)

		// One coalesced remote write, carrying only the latest revision.
		expect(remote.writes).toHaveLength(1)
		expect(remote.writes[0]?.revision).toBe(2)
		expect(remote.current()?.revision).toBe(2)
	})

	it('surfaces a revision-checked write rejection through onRemoteConflict', async () => {
		const initial = activeRevision({
			revision: 1,
			baseRevision: null,
			updatedAt: '2026-06-01T12:00:00.000Z'
		})
		// Another device already advanced the remote to revision 3.
		const remoteRecord = activeRevision({
			revision: 3,
			baseRevision: 2,
			updatedAt: '2026-06-01T12:30:00.000Z'
		})
		const remote = revisionCheckedRemote(remoteRecord)
		const conflicts: (SavedMatchRecord | null)[] = []
		const lifecycle = createSavedMatchLifecycle({
			store: createMemorySavedMatchStore(initial),
			remote
		})
		const session = lifecycle.beginSession({
			initial,
			onRemoteConflict: (r) => conflicts.push(r)
		})

		await session.recordCommittedState({ ...baseMatchState }, descriptor)
		await vi.advanceTimersByTimeAsync(SAVED_MATCH_REMOTE_DEBOUNCE_MS)

		// The write carried baseRevision 1 against remote revision 3 → rejected,
		// and the rejection surfaced with the current remote for resolution.
		expect(conflicts).toEqual([remoteRecord])
		expect(remote.current()).toEqual(remoteRecord)
	})

	it('acknowledges a completed Match with a tombstone that lands in both stores', async () => {
		const initial = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:00:00.000Z'
		})
		const store = createMemorySavedMatchStore(initial)
		const remote = revisionCheckedRemote(initial)
		const lifecycle = createSavedMatchLifecycle({ store, remote })
		const session = lifecycle.beginSession({ initial })

		await session.acknowledgeDeleted()

		const localRecord = await store.get()
		expect(localRecord?.status).toBe('deleted')
		expect(localRecord?.revision).toBe(3)
		expect(localRecord?.baseRevision).toBe(2)
		expect(remote.current()).toEqual(localRecord)
	})

	it('flushes a pending debounced write before the tombstone so the revision chain stays intact', async () => {
		const store = createMemorySavedMatchStore()
		const remote = revisionCheckedRemote()
		const lifecycle = createSavedMatchLifecycle({ store, remote })
		const session = lifecycle.beginSession({ initial: null })

		await session.recordCommittedState({ ...baseMatchState }, descriptor)
		// Acknowledge while revision 1 is still sitting in the debounce window.
		await session.acknowledgeDeleted()

		// Revision 1 must be flushed first, then the tombstone (revision 2,
		// baseRevision 1) — otherwise the revision-checked write rejects and a
		// second device could resurrect the completed Match.
		expect(remote.writes.map((w) => [w.revision, w.status])).toEqual([
			[1, 'active'],
			[2, 'deleted']
		])
		expect(remote.current()?.status).toBe('deleted')
	})

	it('prevents resurrection: a stale device loading after a tombstone sees empty and adopts the tombstone', async () => {
		// Device A acknowledged the completed Match: tombstone revision 3 lives
		// remotely. Device B still holds the stale active revision 2 locally.
		const staleLocal = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:00:00.000Z'
		})
		const tombstone: SavedMatchRecord = {
			...staleLocal,
			revision: 3,
			baseRevision: 2,
			status: 'deleted',
			updatedAt: '2026-06-01T12:30:00.000Z',
			matchState: null
		}
		const deviceBStore = createMemorySavedMatchStore(staleLocal)
		const lifecycle = createSavedMatchLifecycle({
			store: deviceBStore,
			remote: revisionCheckedRemote(tombstone)
		})

		// No resumable Saved Match — the old unfinished copy must not resurrect.
		await expect(lifecycle.load()).resolves.toEqual({ kind: 'empty' })
		// And device B's local store now carries the tombstone forward.
		await expect(deviceBStore.get()).resolves.toEqual(tombstone)
	})
})

describe('SavedMatchLifecycle.resolveConflict', () => {
	it('rebases the chosen revision so the revision-checked write lands, and persists it to both stores', async () => {
		const local = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:10:00.000Z'
		})
		const remoteRecord = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:05:00.000Z'
		})
		const store = createMemorySavedMatchStore(local)
		const remote = revisionCheckedRemote(remoteRecord)
		const lifecycle = createSavedMatchLifecycle({
			store,
			remote,
			now: () => '2026-06-01T12:15:00.000Z'
		})

		const result = await lifecycle.resolveConflict({
			chosen: local,
			loser: remoteRecord
		})

		if (result.kind !== 'ready') {
			throw new Error('expected ready resolution')
		}
		expect(result.record.revision).toBe(3)
		expect(result.record.baseRevision).toBe(2)
		expect(result.record.matchState).toBe(local.matchState)
		await expect(store.get()).resolves.toEqual(result.record)
		expect(remote.current()).toEqual(result.record)
	})

	it('reports a fresh conflict when the remote moved again while resolving', async () => {
		const local = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:10:00.000Z'
		})
		const staleRemote = activeRevision({
			revision: 2,
			baseRevision: 1,
			updatedAt: '2026-06-01T12:05:00.000Z'
		})
		// The Player resolved against revision 2, but the remote advanced to 4.
		const movedRemote = activeRevision({
			revision: 4,
			baseRevision: 3,
			updatedAt: '2026-06-01T12:20:00.000Z'
		})
		const lifecycle = createSavedMatchLifecycle({
			store: createMemorySavedMatchStore(local),
			remote: revisionCheckedRemote(movedRemote)
		})

		await expect(
			lifecycle.resolveConflict({ chosen: local, loser: staleRemote })
		).resolves.toEqual({ kind: 'conflict', remote: movedRemote })
	})
})
