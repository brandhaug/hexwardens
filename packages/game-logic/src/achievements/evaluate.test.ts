import { tribes, type Tribe } from '../domains/tribe'
import { evaluateAchievements, type AchievementContext } from './evaluate'
import { achievementIds, type AchievementId } from './registry'

const baseContext = (
	overrides: Partial<AchievementContext> = {}
): AchievementContext => ({
	playerWon: true,
	tribe: 'barbarians',
	turnCount: 30,
	defeatedBotDifficulty: null,
	completedAt: '2026-05-05T12:00:00Z',
	priorUnlockedIds: new Set<AchievementId>(),
	sideInputs: {},
	...overrides
})

const idsOf = (
	unlocks: ReturnType<typeof evaluateAchievements>
): AchievementId[] => unlocks.map((u) => u.id)

describe('evaluateAchievements', () => {
	it('returns an empty list for a loss with no prior data', () => {
		const result = evaluateAchievements(baseContext({ playerWon: false }))
		expect(result).toEqual([])
	})

	it('unlocks first-win when the player wins for the first time', () => {
		const result = evaluateAchievements(
			baseContext({ sideInputs: { priorWinCount: 0 } })
		)
		expect(idsOf(result)).toContain('first-win')
	})

	it('does not unlock first-win twice', () => {
		const result = evaluateAchievements(
			baseContext({
				sideInputs: { priorWinCount: 5 },
				priorUnlockedIds: new Set(['first-win'])
			})
		)
		expect(idsOf(result)).not.toContain('first-win')
	})

	it('unlocks beat-beginner-bot when player wins against a Beginner bot', () => {
		const result = evaluateAchievements(
			baseContext({ defeatedBotDifficulty: 'Beginner' })
		)
		expect(idsOf(result)).toContain('beat-beginner-bot')
	})

	it('does not unlock bot-difficulty achievements when the player loses', () => {
		const result = evaluateAchievements(
			baseContext({ playerWon: false, defeatedBotDifficulty: 'Expert' })
		)
		expect(idsOf(result)).toEqual([])
	})

	it('unlocks beat-expert-bot when player wins against an Expert bot', () => {
		const result = evaluateAchievements(
			baseContext({ defeatedBotDifficulty: 'Expert' })
		)
		expect(idsOf(result)).toContain('beat-expert-bot')
	})

	it('unlocks ten-ranked-wins on the tenth win', () => {
		const result = evaluateAchievements(
			baseContext({ sideInputs: { priorWinCount: 9 } })
		)
		expect(idsOf(result)).toContain('ten-ranked-wins')
	})

	it('does not unlock ten-ranked-wins below ten', () => {
		const result = evaluateAchievements(
			baseContext({ sideInputs: { priorWinCount: 8 } })
		)
		expect(idsOf(result)).not.toContain('ten-ranked-wins')
	})

	it('unlocks win-as-each-tribe only when this match completes the set', () => {
		const allButOne = new Set<Tribe>(tribes.filter((t) => t !== 'barbarians'))
		const result = evaluateAchievements(
			baseContext({
				tribe: 'barbarians',
				sideInputs: { priorWinningTribes: allButOne }
			})
		)
		expect(idsOf(result)).toContain('win-as-each-tribe')
	})

	it('does not unlock win-as-each-tribe when tribes are still missing', () => {
		const result = evaluateAchievements(
			baseContext({
				tribe: 'barbarians',
				sideInputs: { priorWinningTribes: new Set<Tribe>(['rogues', 'orcs']) }
			})
		)
		expect(idsOf(result)).not.toContain('win-as-each-tribe')
	})

	it('unlocks win-without-losing-capital when the capital was never lost', () => {
		const result = evaluateAchievements(
			baseContext({ sideInputs: { capitalHeldAllMatch: true } })
		)
		expect(idsOf(result)).toContain('win-without-losing-capital')
	})

	it('does not unlock win-without-losing-capital on a loss', () => {
		const result = evaluateAchievements(
			baseContext({
				playerWon: false,
				sideInputs: { capitalHeldAllMatch: true }
			})
		)
		expect(idsOf(result)).not.toContain('win-without-losing-capital')
	})

	it('unlocks win-in-under-twenty-turns when the win takes 19 turns', () => {
		const result = evaluateAchievements(baseContext({ turnCount: 19 }))
		expect(idsOf(result)).toContain('win-in-under-twenty-turns')
	})

	it('does not unlock win-in-under-twenty-turns at exactly 20 turns', () => {
		const result = evaluateAchievements(baseContext({ turnCount: 20 }))
		expect(idsOf(result)).not.toContain('win-in-under-twenty-turns')
	})

	it('unlocks capture-first-capital when player captured a capital this match for the first time', () => {
		const result = evaluateAchievements(
			baseContext({
				sideInputs: {
					enemyCapitalsCapturedThisMatch: 1,
					hasCapturedEnemyCapitalPreviously: false
				}
			})
		)
		expect(idsOf(result)).toContain('capture-first-capital')
	})

	it('does not unlock capture-first-capital again once unlocked', () => {
		const result = evaluateAchievements(
			baseContext({
				sideInputs: {
					enemyCapitalsCapturedThisMatch: 2,
					hasCapturedEnemyCapitalPreviously: true
				},
				priorUnlockedIds: new Set(['capture-first-capital'])
			})
		)
		expect(idsOf(result)).not.toContain('capture-first-capital')
	})

	it('daily-challenge-streak-3 stays inert without sideInputs', () => {
		// Daily-challenge feature ships separately. With no sideInput, never fires.
		const result = evaluateAchievements(
			baseContext({ sideInputs: { priorWinCount: 0 } })
		)
		expect(idsOf(result)).not.toContain('daily-challenge-streak-3')
	})

	it('daily-challenge-streak-3 unlocks once the daily-challenge feature feeds streak >= 3', () => {
		const result = evaluateAchievements(
			baseContext({ sideInputs: { dailyChallengeStreak: 3 } })
		)
		expect(idsOf(result)).toContain('daily-challenge-streak-3')
	})

	it('emits multiple unlocks when several criteria are met simultaneously', () => {
		const allButOne = new Set<Tribe>(tribes.filter((t) => t !== 'barbarians'))
		const result = evaluateAchievements(
			baseContext({
				turnCount: 12,
				defeatedBotDifficulty: 'Expert',
				sideInputs: {
					priorWinCount: 9,
					priorWinningTribes: allButOne,
					capitalHeldAllMatch: true
				}
			})
		)
		const ids = idsOf(result)
		expect(ids).toContain('beat-expert-bot')
		expect(ids).toContain('win-without-losing-capital')
		expect(ids).toContain('win-in-under-twenty-turns')
		expect(ids).toContain('ten-ranked-wins')
		expect(ids).toContain('win-as-each-tribe')
	})

	it('skips already-unlocked entries even when the criteria match', () => {
		const result = evaluateAchievements(
			baseContext({
				turnCount: 5,
				priorUnlockedIds: new Set([
					'first-win',
					'win-in-under-twenty-turns',
					'beat-beginner-bot'
				]),
				defeatedBotDifficulty: 'Beginner',
				sideInputs: { priorWinCount: 0 }
			})
		)
		expect(result).toEqual([])
	})

	it('stamps each unlock with the supplied completedAt timestamp', () => {
		const completedAt = '2026-06-01T08:30:00Z'
		const result = evaluateAchievements(baseContext({ completedAt }))
		for (const unlock of result) {
			expect(unlock.unlockedAt).toBe(completedAt)
		}
	})

	it('only emits IDs from the static registry', () => {
		const result = evaluateAchievements(
			baseContext({
				turnCount: 1,
				defeatedBotDifficulty: 'Expert',
				sideInputs: {
					priorWinCount: 9,
					capitalHeldAllMatch: true,
					enemyCapitalsCapturedThisMatch: 1,
					hasCapturedEnemyCapitalPreviously: false,
					dailyChallengeStreak: 3,
					priorWinningTribes: new Set<Tribe>(
						tribes.filter((t) => t !== 'barbarians')
					)
				}
			})
		)
		for (const unlock of result) {
			expect(achievementIds).toContain(unlock.id)
		}
	})
})
