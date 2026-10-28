import { Result } from 'effect'
import { vi } from 'vite-plus/test'
import { GameHex } from '../board/hex-utils'
import { buildInitialGameState } from '../match/init'
import { allBotConfig } from '../match/test-helpers'
import { runBotTurn } from './bot-turn'

it('replays a seeded bot turn independently of ambient randomness', async () => {
	const initial = buildInitialGameState({ ...allBotConfig(), seed: 42 })
	assert(Result.isSuccess(initial))
	const before = JSON.stringify(initial.success)
	const ambientRandom = vi.spyOn(Math, 'random').mockReturnValue(0.1)
	try {
		const first = await runBotTurn(
			initial.success,
			'barbarians',
			'Beginner',
			GameHex
		)
		ambientRandom.mockReturnValue(0.9)
		const replay = await runBotTurn(
			initial.success,
			'barbarians',
			'Beginner',
			GameHex
		)
		expect(ambientRandom).not.toHaveBeenCalled()
		expect(first.error).toBeUndefined()
		expect(first.intermediateStates.length).toBeGreaterThan(0)
		expect(replay).toEqual(first)
		expect(JSON.stringify(initial.success)).toBe(before)
	} finally {
		ambientRandom.mockRestore()
	}
})
