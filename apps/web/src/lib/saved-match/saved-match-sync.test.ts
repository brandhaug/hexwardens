import { createMemorySavedMatchStore } from './saved-match-store'
import { loadSavedMatchSlot } from './saved-match-sync'
import { type SavedMatchRecord } from '@hexwardens/game-logic/match/saved-match'

function deletedRecord(
	revision: number,
	baseRevision: number | null
): SavedMatchRecord {
	return {
		savedMatchId: 'saved-1',
		revision,
		baseRevision,
		status: 'deleted',
		schemaVersion: 1,
		gameLogicVersion: 'test',
		playerTribe: 'barbarians',
		mapSize: 'medium',
		opponentCount: 1,
		difficulty: 'Beginner',
		turn: revision,
		winner: null,
		updatedAt: `2026-05-14T12:0${revision}:00.000Z`,
		matchState: null
	}
}

describe('loadSavedMatchSlot', () => {
	it('keeps a newer local tombstone over an older remote Saved Match', async () => {
		const local = deletedRecord(2, 1)
		const remote = deletedRecord(1, null)
		const store = createMemorySavedMatchStore(local)
		const writes: SavedMatchRecord[] = []

		const result = await loadSavedMatchSlot({
			store,
			readRemote: () => Promise.resolve(remote),
			writeRemote: (record) => {
				writes.push(record)
				return Promise.resolve({ status: 'ok', record } as const)
			}
		})

		expect(result).toEqual({ kind: 'ready', record: null })
		expect(writes).toEqual([local])
	})

	it('falls back to remote when the local store throws', async () => {
		const remote = deletedRecord(1, null)
		const failingStore = {
			get: () => Promise.reject(new Error('IndexedDB unavailable')),
			put: () => Promise.resolve()
		}

		const result = await loadSavedMatchSlot({
			store: failingStore,
			readRemote: () => Promise.resolve(remote),
			writeRemote: (record) =>
				Promise.resolve({ status: 'ok', record } as const)
		})

		expect(result).toEqual({ kind: 'ready', record: null })
	})
})
