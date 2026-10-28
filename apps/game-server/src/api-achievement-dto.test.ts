import { Schema } from 'effect'
import { AchievementUnlock } from '@hexwardens/api/achievements'

describe('AchievementUnlock DTO', () => {
	const decode = Schema.decodeUnknownSync(AchievementUnlock)

	it('decodes an unlock with a concrete matchId', () => {
		const result = decode({
			achievementId: 'first-win',
			unlockedAt: '2026-01-01T00:00:00Z',
			matchId: 'match-abc'
		})
		expect(result).toEqual({
			achievementId: 'first-win',
			unlockedAt: '2026-01-01T00:00:00Z',
			matchId: 'match-abc'
		})
	})

	it('accepts a null matchId (non-match unlock such as a streak)', () => {
		const result = decode({
			achievementId: 'first-win',
			unlockedAt: '2026-01-01T00:00:00Z',
			matchId: null
		})
		expect(result.matchId).toBeNull()
	})

	it('rejects an unlock missing achievementId', () => {
		expect(() =>
			decode({ unlockedAt: '2026-01-01T00:00:00Z', matchId: null })
		).toThrow(/Expected|Missing|Invalid|check/i)
	})

	it('rejects an unlock missing unlockedAt', () => {
		expect(() => decode({ achievementId: 'first-win', matchId: null })).toThrow(
			/Expected|Missing|Invalid|check/i
		)
	})
})
