import {
	createMemorySavedMatchStore,
	transactionCommitted
} from './saved-match-store'
import { type SavedMatchRecord } from '@hexwardens/game-logic/match/saved-match'

const record: SavedMatchRecord = {
	savedMatchId: 'saved-1',
	revision: 1,
	baseRevision: null,
	status: 'deleted',
	schemaVersion: 1,
	gameLogicVersion: 'test',
	playerTribe: 'barbarians',
	mapSize: 'medium',
	opponentCount: 1,
	difficulty: 'Beginner',
	turn: 8,
	winner: null,
	updatedAt: '2026-05-14T12:00:00.000Z',
	matchState: null
}

describe('SavedMatchStore', () => {
	it('waits for transaction completion rather than request success', async () => {
		const transaction = new EventTarget()
		let completed = false
		const pending = transactionCommitted(transaction).then(() => {
			completed = true
			return completed
		})
		transaction.dispatchEvent(new Event('success'))
		await Promise.resolve()
		expect(completed).toBe(false)
		transaction.dispatchEvent(new Event('complete'))
		await pending
		expect(completed).toBe(true)
	})

	it('rejects a transaction aborted after its request succeeded', async () => {
		const transaction = new EventTarget()
		const pending = transactionCommitted(transaction)
		transaction.dispatchEvent(new Event('success'))
		transaction.dispatchEvent(new Event('abort'))
		await expect(pending).rejects.toMatchObject({
			_tag: 'SavedMatchStorageError',
			operation: 'transaction'
		})
	})

	it('persists the latest Saved Match record through the store interface', async () => {
		const store = createMemorySavedMatchStore()

		await store.put(record)

		await expect(store.get()).resolves.toEqual(record)
	})
})
