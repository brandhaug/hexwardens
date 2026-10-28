import { Result } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { createInMemoryMatchInitializer } from './in-memory-initializer'
import {
	parseLobbySnapshot,
	snapshotToMatchConfig,
	type LobbySnapshot,
	type MatchInitOutcome
} from './initializer'

function validSnapshot(overrides: Partial<LobbySnapshot> = {}): LobbySnapshot {
	return {
		lobbyId: 'lobby-1',
		config: {
			mapSize: 'small',
			maxPlayers: 2,
			turnTimerSeconds: 60
		},
		slots: [
			{
				slotIndex: 0,
				playerId: 'p1',
				username: 'alice',
				tribe: 'barbarians',
				isBot: false,
				botDifficulty: 'Beginner'
			},
			{
				slotIndex: 1,
				playerId: 'p2',
				username: 'bob',
				tribe: 'rogues',
				isBot: false,
				botDifficulty: 'Beginner'
			}
		],
		...overrides
	}
}

// The "fake caller" mirrors the Matchmaker switch statement: on
// started/already-started it deletes the lobby and broadcasts; on any other
// outcome the lobby is left intact. This models the port's central invariant.
type FakeCallerResult = {
	outcome: MatchInitOutcome
	lobbyDeleted: boolean
	broadcastedMatchId: string | null
	hostError: string | null
}

async function runCaller(
	initializer: ReturnType<typeof createInMemoryMatchInitializer>,
	snapshot: LobbySnapshot,
	idempotencyKey: string
): Promise<FakeCallerResult> {
	const outcome = await initializer.startMatch(snapshot, idempotencyKey)
	switch (outcome.status) {
		case 'started':
		case 'already-started': {
			return {
				outcome,
				lobbyDeleted: true,
				broadcastedMatchId: outcome.matchId,
				hostError: null
			}
		}
		case 'transient': {
			return {
				outcome,
				lobbyDeleted: false,
				broadcastedMatchId: null,
				hostError: `transient (retry ${outcome.retryAfterMs}ms)`
			}
		}
		case 'invalid': {
			return {
				outcome,
				lobbyDeleted: false,
				broadcastedMatchId: null,
				hostError: outcome.issues[0] ?? 'invalid'
			}
		}
		case 'permanent': {
			return {
				outcome,
				lobbyDeleted: false,
				broadcastedMatchId: null,
				hostError: outcome.reason
			}
		}
	}
	const exhaustive: never = outcome
	return exhaustive
}

describe('MatchInitializer port — boundary tests', () => {
	it('happy path: valid lobby → started → lobby deleted, matchId broadcast', async () => {
		const initializer = createInMemoryMatchInitializer()
		const snapshot = validSnapshot()

		const result = await runCaller(initializer, snapshot, 'lobby-1:123')

		expect(result.outcome.status).toBe('started')
		expect(result.lobbyDeleted).toBe(true)
		expect(result.broadcastedMatchId).toBe('lobby-1:123')
		expect(result.hostError).toBeNull()
		expect(initializer.calls).toHaveLength(1)
	})

	it('transient failure → retry with same key returns already-started; match is not re-initialized', async () => {
		const initializer = createInMemoryMatchInitializer()
		initializer.programOutcomes('lobby-1:123', [
			{ status: 'transient', retryAfterMs: 500 }
		])

		const first = await runCaller(initializer, validSnapshot(), 'lobby-1:123')
		expect(first.outcome.status).toBe('transient')
		expect(first.lobbyDeleted).toBe(false)

		// Retry with the same key and snapshot — matchmaker would re-read SQL.
		const second = await runCaller(initializer, validSnapshot(), 'lobby-1:123')
		expect(second.outcome.status).toBe('started')
		expect(second.lobbyDeleted).toBe(true)
		const startedMatchId =
			second.outcome.status === 'started' ? second.outcome.matchId : null
		expect(startedMatchId).toBe('lobby-1:123')

		const third = await runCaller(initializer, validSnapshot(), 'lobby-1:123')
		expect(third.outcome.status).toBe('already-started')
		const replayedMatchId =
			third.outcome.status === 'already-started' ? third.outcome.matchId : null
		expect(replayedMatchId).toBe('lobby-1:123')
	})

	it('invalid lobby JSON → invalid → lobby remains intact', async () => {
		const initializer = createInMemoryMatchInitializer()
		// Bad snapshot: slots list is empty.
		const badSnapshot = {
			lobbyId: 'lobby-1',
			config: { mapSize: 'small', maxPlayers: 2, turnTimerSeconds: null },
			slots: []
		} satisfies LobbySnapshot

		const result = await runCaller(initializer, badSnapshot, 'lobby-1:123')

		expect(result.outcome.status).toBe('invalid')
		expect(result.lobbyDeleted).toBe(false)
		expect(result.hostError).not.toBeNull()
	})

	it('invalid: a null bot tribe is rejected before reaching the match DO', async () => {
		const initializer = createInMemoryMatchInitializer()
		const badSnapshot = {
			lobbyId: 'lobby-1',
			config: { mapSize: 'small', maxPlayers: 2, turnTimerSeconds: null },
			slots: [
				{
					slotIndex: 0,
					playerId: 'bot_0',
					username: 'Bot 1',
					tribe: null,
					isBot: true,
					botDifficulty: 'Beginner'
				}
			]
		}

		// @ts-expect-error: Malformed external snapshots intentionally bypass the typed caller contract.
		const result = await runCaller(initializer, badSnapshot, 'lobby-1:123')

		expect(result.outcome.status).toBe('invalid')
		expect(result.lobbyDeleted).toBe(false)
		expect(result.hostError).not.toBeNull()
	})

	it('rejects the returned promise when match ID derivation throws', async () => {
		const failure = new Error('match ID derivation failed')
		const initializer = createInMemoryMatchInitializer({
			deriveMatchId: () => {
				throw failure
			}
		})
		const pending = initializer.startMatch(validSnapshot(), 'lobby-1:123')
		await expect(pending).rejects.toBe(failure)
	})

	it('permanent failure → lobby remains intact', async () => {
		const initializer = createInMemoryMatchInitializer()
		initializer.programOutcomes('lobby-1:123', [
			{ status: 'permanent', reason: 'Match requires at least one player' }
		])

		const result = await runCaller(initializer, validSnapshot(), 'lobby-1:123')

		expect(result.outcome.status).toBe('permanent')
		expect(result.lobbyDeleted).toBe(false)
		expect(result.hostError).toBe('Match requires at least one player')
	})

	it('bot + human mix: MatchConfig preserves slot ordering and bot difficulty', () => {
		const snapshot = validSnapshot({
			slots: [
				{
					slotIndex: 2,
					playerId: 'bot_2',
					username: 'Bot 3',
					tribe: 'orcs',
					isBot: true,
					botDifficulty: 'Expert'
				},
				{
					slotIndex: 0,
					playerId: 'p1',
					username: 'alice',
					tribe: 'barbarians',
					isBot: false,
					botDifficulty: 'Beginner'
				},
				{
					slotIndex: 1,
					playerId: 'bot_1',
					username: 'Bot 2',
					tribe: 'druids',
					isBot: true,
					botDifficulty: 'Advanced'
				}
			]
		})

		const config = snapshotToMatchConfig(snapshot)

		expect(config.players.map((p) => p.playerId)).toEqual([
			'p1',
			'bot_1',
			'bot_2'
		])
		expect(config.players[1]?.botDifficulty).toBe('Advanced')
		expect(config.players[2]?.botDifficulty).toBe('Expert')
		expect(config.players.map((p) => p.tribe)).toEqual([
			'barbarians',
			'druids',
			'orcs'
		])
	})

	it('parseLobbySnapshot rejects negative slot indexes', () => {
		const parsed = parseLobbySnapshot({
			...validSnapshot(),
			slots: [
				{
					slotIndex: -1,
					playerId: 'p1',
					username: 'alice',
					tribe: 'barbarians',
					isBot: false,
					botDifficulty: 'Beginner'
				}
			]
		})
		expect(Result.isFailure(parsed)).toBe(true)
	})
})
