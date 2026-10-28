import { Result } from 'effect'
import {
	SchemaViolationError,
	ViewerTribeMissingError
} from '../fog-of-war/errors'
import { createInitialMatchState } from './init'
import {
	fogProjectionFailureLogData,
	projectStateForTribes
} from './state-projection'
import { humanVsHumanConfig } from './test-helpers'
import { type MatchState } from './types'

function makeMatch(): MatchState {
	return Result.getOrThrow(
		createInitialMatchState(
			'match-1',
			{ ...humanVsHumanConfig(), seed: 1 },
			1000
		)
	)
}

describe('projectStateForTribes', () => {
	it('returns a fog-filtered gameState message per connected Tribe', () => {
		const match = makeMatch()

		const projections = projectStateForTribes(match, ['barbarians', 'rogues'])

		expect(projections).toHaveLength(2)
		expect(projections.map((p) => p.tribe)).toEqual(['barbarians', 'rogues'])
		for (const projection of projections) {
			expect(projection.ok).toBe(true)
			if (!projection.ok) {
				continue
			}
			expect(projection.message.type).toBe('gameState')
			expect(projection.message.viewer).toBe(projection.tribe)
			expect(projection.message.currentTurn).toBe(
				match.gameState.currentPlayerTribe
			)
			expect(projection.message.turnEndsAt).toBe(match.turnSchedule?.deadline)
			// Fog projection must strip the RNG seed from the wire payload.
			expect('seed' in projection.message.state).toBe(false)
		}
	})

	it('projects each Tribe independently — the two messages differ by viewer', () => {
		const match = makeMatch()

		const [a, b] = projectStateForTribes(match, ['barbarians', 'rogues'])

		expect(a?.ok).toBe(true)
		expect(b?.ok).toBe(true)
		assert(!(!a?.ok || !b?.ok))
		// Each viewer keeps its own exploration; the opponent's is stripped.
		expect(a.message.state.playerStates.rogues?.exploration).toEqual({})
		expect(b.message.state.playerStates.barbarians?.exploration).toEqual({})
	})

	it('de-duplicates repeated Tribes, preserving first-seen order', () => {
		const match = makeMatch()

		const projections = projectStateForTribes(match, [
			'rogues',
			'barbarians',
			'rogues',
			'barbarians'
		])

		expect(projections.map((p) => p.tribe)).toEqual(['rogues', 'barbarians'])
	})

	it('reports a projection failure for one Tribe while others still succeed', () => {
		const match = makeMatch()

		// 'druids' is not a player in this match, so its Fog projection fails
		// with ViewerTribeMissingError. The other Tribes must be unaffected.
		const projections = projectStateForTribes(match, [
			'barbarians',
			'druids',
			'rogues'
		])

		expect(projections.map((p) => ({ tribe: p.tribe, ok: p.ok }))).toEqual([
			{ tribe: 'barbarians', ok: true },
			{ tribe: 'druids', ok: false },
			{ tribe: 'rogues', ok: true }
		])
		const failure = projections[1]
		if (!failure || failure.ok) {
			throw new Error('expected druids projection to fail')
		}
		expect(failure.error._tag).toBe('ViewerTribeMissingError')
		expect(failure.error.message).toContain('druids')
	})

	it('returns no projections for an empty Tribe list', () => {
		expect(projectStateForTribes(makeMatch(), [])).toEqual([])
	})
})

describe('fogProjectionFailureLogData', () => {
	it('flattens ViewerTribeMissingError into the log-stable record', () => {
		const error = new ViewerTribeMissingError({
			tribe: 'druids',
			message: 'Viewer tribe "druids" has no player state'
		})

		expect(fogProjectionFailureLogData('druids', error)).toEqual({
			tribe: 'druids',
			error: 'ViewerTribeMissingError',
			message: 'Viewer tribe "druids" has no player state',
			path: undefined
		})
	})

	it('joins SchemaViolationError paths with dots', () => {
		const error = new SchemaViolationError({
			tribe: 'rogues',
			path: ['units', 'board', 3, 1],
			message: 'invalid tile'
		})

		expect(fogProjectionFailureLogData('rogues', error)).toEqual({
			tribe: 'rogues',
			error: 'SchemaViolationError',
			message: 'invalid tile',
			path: 'units.board.3.1'
		})
	})
})
