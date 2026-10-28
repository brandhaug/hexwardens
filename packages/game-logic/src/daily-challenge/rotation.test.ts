import { dailyChallengeIds } from './registry'
import { dailyChallengeForDate } from './rotation'

describe('dailyChallengeForDate', () => {
	it('returns a registered challenge ID', () => {
		const id = dailyChallengeForDate('2026-05-13')
		expect(dailyChallengeIds).toContain(id)
	})

	it('is deterministic for a given date', () => {
		const a = dailyChallengeForDate('2026-05-13')
		const b = dailyChallengeForDate('2026-05-13')
		expect(a).toBe(b)
	})

	it('cycles by modulo of the date-seed over the registry length', () => {
		const len = dailyChallengeIds.length
		const reference = dailyChallengeForDate('2026-05-13')
		const expected = dailyChallengeIds[20_260_513 % len]
		expect(reference).toBe(expected)
	})
})
