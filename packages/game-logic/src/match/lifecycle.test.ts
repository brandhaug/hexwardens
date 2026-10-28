import { Result } from 'effect'
import { restoreMatchState } from './checkpoint'
import { createInitialMatchState } from './init'
import { step } from './step'
import { allBotConfig } from './test-helpers'

function botMatch() {
	const result = createInitialMatchState(
		'lifecycle',
		{ ...allBotConfig(), seed: 7 },
		1000
	)
	if (Result.isFailure(result)) {
		throw result.failure
	}
	return result.success
}

describe('match execution lifecycle', () => {
	it('restores a running bot without changing its durable deadline', () => {
		const running = step(botMatch(), { kind: 'runBotTurn' }, 1000).nextState
		expect(running.execution).toBe('bot-running')
		const restored = restoreMatchState(structuredClone(running))
		const resumed = step(restored, { kind: 'hostResumed' }, 2000).nextState
		expect(resumed.execution).toBeUndefined()
		expect(resumed.turnSchedule).toEqual(running.turnSchedule)
		expect(step(resumed, { kind: 'runBotTurn' }, 2000).effects).toContainEqual(
			expect.objectContaining({ t: 'awaitBotTurn' })
		)
	})

	it('does not run a bot twice or apply a human timeout during bot execution', () => {
		const running = step(botMatch(), { kind: 'runBotTurn' }, 1000).nextState
		for (const command of [
			{ kind: 'runBotTurn' },
			{ kind: 'turnTimeout' }
		] as const) {
			const next = step(running, command, 1001)
			expect(next.nextState).toBe(running)
			expect(next.effects).toEqual([])
		}
	})

	it('rejects a stale bot result after an opponent forfeits', () => {
		const input = botMatch()
		const running = step(input, { kind: 'runBotTurn' }, 1000).nextState
		const other = input.config.players.find(
			(player) => player.tribe !== input.gameState.currentPlayerTribe
		)
		assert(other)
		const ended = step(
			running,
			{ kind: 'forfeit', tribe: other.tribe, username: other.username },
			1001
		).nextState
		const resolved = step(
			ended,
			{
				kind: 'botTurnResolved',
				tribe: input.gameState.currentPlayerTribe,
				baseGameState: input.gameState,
				run: { finalState: input.gameState, intermediateStates: [] }
			},
			1002
		)
		expect(resolved.nextState).toBe(ended)
		expect(ended.execution).toBeUndefined()
		expect(ended.gameState.isGameOver).toBe(true)
		expect(resolved.lifecycle).toContainEqual(
			expect.objectContaining({ t: 'botTurnFailed' })
		)
	})

	it('keeps terminal deletion retryable across reload and rejects admission', () => {
		const input = { ...botMatch(), turnSchedule: null, connectionCount: 0 }
		const terminal = step(input, { kind: 'cleanup' }, 1500).nextState
		expect(terminal.execution).toBe('cleanup-pending')
		const restored = restoreMatchState(structuredClone(terminal))
		expect(
			step(restored, { kind: 'connectionOpened', playerId: 'p1' }, 2000)
				.nextState
		).toBe(restored)
		expect(step(restored, { kind: 'cleanup' }, 2000).effects).toEqual([
			{ t: 'matchDestroyed' }
		])
	})
})
