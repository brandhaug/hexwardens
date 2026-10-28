import { Result } from 'effect'
import { buildGameStateMessage } from './view-projection'
import { createInitialMatchState } from './init'

describe('buildGameStateMessage', () => {
	it('projects a Match into the filtered gameState message for one Tribe', () => {
		const match = Result.getOrThrow(
			createInitialMatchState(
				'match-1',
				{
					mapSize: 'small',
					turnTimerSeconds: 60,
					players: [
						{
							playerId: 'p1',
							username: 'A',
							tribe: 'barbarians',
							isBot: false,
							botDifficulty: 'Beginner'
						},
						{
							playerId: 'p2',
							username: 'B',
							tribe: 'rogues',
							isBot: false,
							botDifficulty: 'Beginner'
						}
					],
					seed: 1
				},
				1000
			)
		)

		const message = buildGameStateMessage(match, 'barbarians')

		expect(Result.isSuccess(message)).toBe(true)
		assert(Result.isSuccess(message))
		expect(message.success.type).toBe('gameState')
		expect(message.success.currentTurn).toBe(match.gameState.currentPlayerTribe)
		expect(message.success.turnEndsAt).toBe(match.turnSchedule?.deadline)
		expect('seed' in message.success.state).toBe(false)
	})
})
