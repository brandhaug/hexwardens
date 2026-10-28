import { Result } from 'effect'
import { createInitialMatchState } from './init'
import {
	SAVED_MATCH_SCHEMA_VERSION,
	createSavedMatchRevision,
	markSavedMatchDeleted,
	rebaseSavedMatchOnto,
	resolveSavedMatchSync,
	validateSavedMatchForContinue
} from './saved-match'
import { type MatchConfig } from '../multiplayer/types'

const config: MatchConfig = {
	mapSize: 'medium',
	turnTimerSeconds: null,
	players: [
		{
			playerId: 'offline_player_1',
			username: 'Player 1',
			tribe: 'barbarians',
			isBot: false,
			botDifficulty: 'Beginner'
		},
		{
			playerId: 'offline_bot_1',
			username: 'Rogues AI',
			tribe: 'rogues',
			isBot: true,
			botDifficulty: 'Beginner'
		}
	],
	seed: 42
}

function initialMatch() {
	const result = createInitialMatchState('offline-match', config, 1_700_000_000)
	if (Result.isFailure(result)) {
		throw result.failure
	}
	return result.success
}

describe('Saved Match', () => {
	it('creates a resumable revision with summary metadata from a MatchState', () => {
		const matchState = initialMatch()

		const saved = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState,
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'test'
		})

		expect(saved).toMatchObject({
			savedMatchId: 'saved-1',
			revision: 1,
			baseRevision: null,
			status: 'active',
			schemaVersion: SAVED_MATCH_SCHEMA_VERSION,
			gameLogicVersion: 'test',
			playerTribe: 'barbarians',
			mapSize: 'medium',
			opponentCount: 1,
			difficulty: 'Beginner',
			turn: 1,
			winner: null,
			updatedAt: '2026-05-14T12:00:00.000Z',
			matchState
		})
	})

	it('marks an acknowledged Saved Match as a deleted revision', () => {
		const saved = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'test'
		})

		const deleted = markSavedMatchDeleted({
			previous: saved,
			updatedAt: '2026-05-14T12:05:00.000Z'
		})

		expect(deleted).toMatchObject({
			savedMatchId: 'saved-1',
			revision: 2,
			baseRevision: 1,
			status: 'deleted',
			schemaVersion: SAVED_MATCH_SCHEMA_VERSION,
			gameLogicVersion: 'test',
			playerTribe: 'barbarians',
			mapSize: 'medium',
			opponentCount: 1,
			difficulty: 'Beginner',
			turn: 1,
			winner: null,
			updatedAt: '2026-05-14T12:05:00.000Z',
			matchState: null
		})
	})

	it('detects true divergence when local and remote revisions advance from the same base', () => {
		const base = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'test'
		})
		const local = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: {
				...base.matchState,
				gameState: { ...base.matchState.gameState, turn: 2 }
			},
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:10:00.000Z',
			gameLogicVersion: 'test',
			previous: base
		})
		const remote = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: {
				...base.matchState,
				gameState: { ...base.matchState.gameState, turn: 3 }
			},
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:20:00.000Z',
			gameLogicVersion: 'test',
			previous: base
		})

		expect(resolveSavedMatchSync(local, remote)).toEqual({
			kind: 'diverged',
			local,
			remote,
			recommended: 'remote'
		})
	})

	it('rejects revisions stamped with a different gameLogicVersion', () => {
		const saved = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'saved-match-v0'
		})

		expect(
			validateSavedMatchForContinue(saved, {
				expectedGameLogicVersion: 'saved-match-v1'
			})
		).toEqual({ ok: false, reason: 'unsupported_game_logic' })
	})

	it('reports in-sync when local and remote agree on every revision field', () => {
		const record = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'test'
		})

		expect(resolveSavedMatchSync(record, record)).toEqual({
			kind: 'in-sync',
			record
		})
	})

	it('rebases the chosen revision onto the loser during conflict resolution', () => {
		const base = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'test'
		})
		const remote = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:10:00.000Z',
			gameLogicVersion: 'test',
			previous: base
		})
		const local = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:20:00.000Z',
			gameLogicVersion: 'test',
			previous: base
		})

		const rebased = rebaseSavedMatchOnto({
			chosen: local,
			loser: remote,
			updatedAt: '2026-05-14T12:30:00.000Z'
		})

		expect(rebased.revision).toBe(remote.revision + 1)
		expect(rebased.baseRevision).toBe(remote.revision)
		expect(rebased.updatedAt).toBe('2026-05-14T12:30:00.000Z')
		if (rebased.status === 'deleted') {
			throw new Error('expected active')
		}
		expect(rebased.matchState).toBe(local.matchState)
	})

	it('rejects incompatible Saved Match snapshots before continue', () => {
		const saved = createSavedMatchRevision({
			savedMatchId: 'saved-1',
			matchState: initialMatch(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-05-14T12:00:00.000Z',
			gameLogicVersion: 'test'
		})
		const incompatible = {
			...saved,
			schemaVersion: SAVED_MATCH_SCHEMA_VERSION + 1
		}

		expect(validateSavedMatchForContinue(incompatible)).toEqual({
			ok: false,
			reason: 'unsupported_schema'
		})
	})
})
