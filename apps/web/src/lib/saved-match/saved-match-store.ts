import { Effect, Schema } from 'effect'
import {
	isSavedMatchRecord,
	type SavedMatchRecord
} from '@hexwardens/game-logic/match/saved-match'

const DB_NAME = 'hexwardens-saved-match'
const DB_VERSION = 1
const STORE_NAME = 'saved-match'
const ACTIVE_KEY = 'active'

export interface SavedMatchStore {
	get(): Promise<SavedMatchRecord | null>
	put(record: SavedMatchRecord): Promise<void>
}

export function createMemorySavedMatchStore(
	initial: SavedMatchRecord | null = null
): SavedMatchStore {
	let current = initial
	return {
		get() {
			return Effect.runPromise(Effect.succeed(current))
		},
		put(record) {
			current = record
			return Effect.runPromise(Effect.void)
		}
	}
}

export function createBrowserSavedMatchStore(): SavedMatchStore {
	let dbPromise: Promise<IDBDatabase> | null = null

	function db(): Promise<IDBDatabase> {
		if (dbPromise === null) {
			dbPromise = openDb()
		}
		return dbPromise
	}

	return {
		async get() {
			const database = await db()
			const request = database
				.transaction(STORE_NAME, 'readonly')
				.objectStore(STORE_NAME)
				.get(ACTIVE_KEY)
			const result = await requestResult(request)
			return isSavedMatchRecord(result) ? result : null
		},
		async put(record) {
			const database = await db()
			const transaction = database.transaction(STORE_NAME, 'readwrite', {
				durability: 'strict'
			})
			const committed = transactionCommitted(transaction)
			transaction.objectStore(STORE_NAME).put(record, ACTIVE_KEY)
			await committed
		}
	}
}

/** IDB request success precedes commit and can still be followed by an abort. */
export function transactionCommitted(
	transaction: Pick<EventTarget, 'addEventListener'>
): Promise<void> {
	return Effect.runPromise(
		Effect.callback<null, SavedMatchStorageError>((resume) => {
			transaction.addEventListener(
				'complete',
				() => resume(Effect.succeed(null)),
				{
					once: true
				}
			)
			transaction.addEventListener(
				'abort',
				() =>
					resume(
						Effect.fail(
							new SavedMatchStorageError({ operation: 'transaction' })
						)
					),
				{ once: true }
			)
			transaction.addEventListener(
				'error',
				() =>
					resume(
						Effect.fail(
							new SavedMatchStorageError({ operation: 'transaction' })
						)
					),
				{ once: true }
			)
		}).pipe(Effect.asVoid)
	)
}

class SavedMatchStorageError extends Schema.TaggedError<SavedMatchStorageError>()(
	'SavedMatchStorageError',
	{ operation: Schema.String }
) {}

function openDb(): Promise<IDBDatabase> {
	return Effect.runPromise(
		Effect.callback<IDBDatabase, SavedMatchStorageError>((resume) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION)
			request.addEventListener(
				'upgradeneeded',
				() => {
					const database = request.result
					if (!database.objectStoreNames.contains(STORE_NAME)) {
						database.createObjectStore(STORE_NAME)
					}
				},
				{ once: true }
			)
			request.addEventListener(
				'success',
				() => resume(Effect.succeed(request.result)),
				{ once: true }
			)
			request.addEventListener(
				'error',
				() =>
					resume(
						Effect.fail(new SavedMatchStorageError({ operation: 'open' }))
					),
				{ once: true }
			)
		})
	)
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return Effect.runPromise(
		Effect.callback<T, SavedMatchStorageError>((resume) => {
			request.addEventListener(
				'success',
				() => resume(Effect.succeed(request.result)),
				{ once: true }
			)
			request.addEventListener(
				'error',
				() =>
					resume(
						Effect.fail(new SavedMatchStorageError({ operation: 'request' }))
					),
				{ once: true }
			)
		})
	)
}
