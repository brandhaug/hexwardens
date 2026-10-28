import { Effect } from 'effect'
import {
	resolveSavedMatchSync,
	type SavedMatchRecord
} from '@hexwardens/game-logic/match/saved-match'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { type SavedMatchStore } from './saved-match-store'

export type SavedMatchRemoteWriteResult =
	| { readonly status: 'ok'; readonly record: SavedMatchRecord }
	| { readonly status: 'anonymous' }
	| { readonly status: 'conflict'; readonly remote: SavedMatchRecord | null }

export type SavedMatchSlotResult =
	| { readonly kind: 'ready'; readonly record: SavedMatchRecord | null }
	| {
			readonly kind: 'conflict'
			readonly local: SavedMatchRecord
			readonly remote: SavedMatchRecord
			readonly recommended: 'local' | 'remote'
	  }

export type LoadSavedMatchSlotArgs = {
	readonly store: SavedMatchStore
	readonly readRemote: () => Promise<SavedMatchRecord | null>
	readonly writeRemote: (
		record: SavedMatchRecord
	) => Promise<SavedMatchRemoteWriteResult>
}

export async function loadSavedMatchSlot(
	args: LoadSavedMatchSlotArgs
): Promise<SavedMatchSlotResult> {
	const [local, remote] = await Effect.runPromise(
		Effect.all(
			[
				Effect.promise(() => readLocalOrNull(args.store)),
				Effect.promise(() => readRemoteOrNull(args.readRemote))
			],
			{ concurrency: 'unbounded' }
		)
	)
	const resolution = resolveSavedMatchSync(local, remote)

	switch (resolution.kind) {
		case 'empty': {
			return ready(null)
		}
		case 'in-sync': {
			return ready(activeRecord(resolution.record))
		}
		case 'use-remote': {
			await args.store.put(resolution.record)
			return ready(activeRecord(resolution.record))
		}
		case 'use-local': {
			const write = await writeRemoteOrAnonymous(
				args.writeRemote,
				resolution.record
			)
			if (write.status === 'conflict' && write.remote) {
				return {
					kind: 'conflict',
					local: resolution.record,
					remote: write.remote,
					recommended: recommended(resolution.record, write.remote)
				}
			}
			return ready(activeRecord(resolution.record))
		}
		case 'diverged': {
			return {
				kind: 'conflict',
				local: resolution.local,
				remote: resolution.remote,
				recommended: resolution.recommended
			}
		}
		default: {
			return assertNever(resolution)
		}
	}
}

function ready(record: SavedMatchRecord | null): SavedMatchSlotResult {
	return { kind: 'ready', record }
}

function activeRecord(record: SavedMatchRecord): SavedMatchRecord | null {
	return record.status === 'deleted' ? null : record
}

function readLocalOrNull(
	store: SavedMatchStore
): Promise<SavedMatchRecord | null> {
	// IndexedDB may be unavailable (private-mode quirks, OPFS quota errors,
	// schema mismatches). Falling back to `null` lets remote sync still work
	// and prevents the `/game` route from getting stuck on the loading gate.
	return Effect.runPromise(
		Effect.tryPromise(() => store.get()).pipe(Effect.orElseSucceed(() => null))
	)
}

function readRemoteOrNull(
	readRemote: () => Promise<SavedMatchRecord | null>
): Promise<SavedMatchRecord | null> {
	return Effect.runPromise(
		Effect.tryPromise(() => readRemote()).pipe(Effect.orElseSucceed(() => null))
	)
}

function writeRemoteOrAnonymous(
	writeRemote: (
		record: SavedMatchRecord
	) => Promise<SavedMatchRemoteWriteResult>,
	record: SavedMatchRecord
): Promise<SavedMatchRemoteWriteResult> {
	return Effect.runPromise(
		Effect.tryPromise(() => writeRemote(record)).pipe(
			Effect.orElseSucceed(() => ({ status: 'anonymous' }) as const)
		)
	)
}

function recommended(
	local: SavedMatchRecord,
	remote: SavedMatchRecord
): 'local' | 'remote' {
	return Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt)
		? 'local'
		: 'remote'
}
