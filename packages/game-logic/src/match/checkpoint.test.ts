import { Result } from 'effect'
import { MatchHydrationError, restoreMatchState } from './checkpoint'
import { createInitialMatchState } from './init'
import { allBotConfig, humanVsHumanConfig } from './test-helpers'
import {
	createSavedMatchRevision,
	SAVED_MATCH_GAME_LOGIC_VERSION,
	validateSavedMatchForContinue
} from './saved-match'

function fixture(bot = false) {
	const initial = createInitialMatchState(
		'hydration',
		{ ...(bot ? allBotConfig() : humanVsHumanConfig()), seed: 7 },
		1000
	)
	if (Result.isFailure(initial)) {
		throw initial.failure
	}
	return initial.success
}

function legacy(value: string | { bot: string }, status = 'active') {
	return JSON.stringify({
		status,
		value,
		context: { result: null },
		historyValue: {},
		children: {}
	})
}

describe('match checkpoint restoration', () => {
	it('migrates human and ended checkpoints without retaining derived modes', () => {
		const input = fixture()
		const human = restoreMatchState({
			...input,
			orchestration: legacy('human')
		})
		expect(human).toEqual(input)
		expect(human).not.toHaveProperty('orchestration')
		const ended = {
			...input,
			gameState: { ...input.gameState, isGameOver: true },
			turnSchedule: null
		}
		expect(
			restoreMatchState({ ...ended, orchestration: legacy('ended') })
		).toEqual(ended)
	})

	it.each(['scheduled', 'running'])(
		'migrates bot %s checkpoints and preserves deadlines',
		(mode) => {
			const input = fixture(true)
			const restored = restoreMatchState({
				...input,
				orchestration: legacy({ bot: mode })
			})
			expect(restored.execution).toBe(
				mode === 'running' ? 'bot-running' : undefined
			)
			expect(restored.turnSchedule).toEqual(input.turnSchedule)
			expect(restored.gameState).toEqual(input.gameState)
			expect(restored).not.toHaveProperty('orchestration')
		}
	)

	it('preserves a legacy terminal deletion checkpoint', () => {
		const restored = restoreMatchState({
			...fixture(),
			connectionCount: 0,
			turnSchedule: null,
			cleanupDeadline: 1000,
			orchestration: legacy('destroyed', 'done')
		})
		expect(restored.execution).toBe('cleanup-pending')
		expect(restored.cleanupDeadline).toBe(1000)
	})

	it('rejects unknown modes, contradictory modes and transient publications', () => {
		for (const orchestration of [
			legacy('unknown'),
			legacy('ended'),
			legacy({ bot: 'running' }),
			JSON.stringify({
				status: 'active',
				value: 'human',
				context: { result: { effects: [] } },
				historyValue: {},
				children: {}
			})
		]) {
			expect(() => restoreMatchState({ ...fixture(), orchestration })).toThrow(
				MatchHydrationError
			)
		}
		expect(() =>
			restoreMatchState({ ...fixture(), execution: 'unknown' })
		).toThrow(MatchHydrationError)
		expect(() =>
			restoreMatchState({ ...fixture(), execution: 'bot-running' })
		).toThrow(MatchHydrationError)
		expect(() =>
			restoreMatchState({
				...fixture(),
				execution: 'cleanup-pending',
				connectionCount: 1
			})
		).toThrow(MatchHydrationError)
	})

	it('rejects missing or human bot deadlines and corrupted game records', () => {
		for (const turnSchedule of [null, { kind: 'human', deadline: 0 }]) {
			expect(() =>
				restoreMatchState({ ...fixture(true), turnSchedule })
			).toThrow(MatchHydrationError)
		}
		const input = fixture()
		expect(() =>
			restoreMatchState({
				...input,
				gameState: {
					...input.gameState,
					units: { ...input.gameState.units, unitStates: {} }
				}
			})
		).toThrow(MatchHydrationError)
	})

	it('accepts compatible saved revisions and still rejects pre-normalized saves', () => {
		const record = createSavedMatchRevision({
			savedMatchId: 'save',
			matchState: fixture(),
			playerTribe: 'barbarians',
			difficulty: 'Beginner',
			opponentCount: 1,
			updatedAt: '2026-10-12T00:00:00Z',
			gameLogicVersion: 'normalized-xstate-v3'
		})
		expect(
			validateSavedMatchForContinue(record, {
				expectedGameLogicVersion: SAVED_MATCH_GAME_LOGIC_VERSION
			}).ok
		).toBe(true)
		expect(
			validateSavedMatchForContinue(
				{ ...record, gameLogicVersion: 'legacy' },
				{ expectedGameLogicVersion: SAVED_MATCH_GAME_LOGIC_VERSION }
			).ok
		).toBe(false)
	})
})
