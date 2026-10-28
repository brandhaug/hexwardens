import { Schema } from 'effect'
import { DailyBest, DailyLeaderboardEntry } from '@hexwardens/api/daily'

describe('DailyLeaderboardEntry DTO', () => {
	const decode = Schema.decodeUnknownSync(DailyLeaderboardEntry)

	it('decodes a typical entry row', () => {
		const result = decode({
			userId: 'user-1',
			username: 'alice',
			bestTurns: 12,
			firstCompletedAt: '2026-01-01T00:00:00Z'
		})
		expect(result).toEqual({
			userId: 'user-1',
			username: 'alice',
			bestTurns: 12,
			firstCompletedAt: '2026-01-01T00:00:00Z'
		})
	})

	it('rejects an entry with a non-numeric bestTurns', () => {
		expect(() =>
			decode({
				userId: 'user-1',
				username: 'alice',
				bestTurns: '12',
				firstCompletedAt: '2026-01-01T00:00:00Z'
			})
		).toThrow(/Expected|Missing|Invalid|check/i)
	})

	it('rejects an entry missing username', () => {
		expect(() =>
			decode({
				userId: 'user-1',
				bestTurns: 12,
				firstCompletedAt: '2026-01-01T00:00:00Z'
			})
		).toThrow(/Expected|Missing|Invalid|check/i)
	})
})

describe('DailyBest DTO', () => {
	const decode = Schema.decodeUnknownSync(DailyBest)

	it('decodes a caller-best row with completion count and timestamps', () => {
		const result = decode({
			userId: 'user-1',
			username: 'alice',
			bestTurns: 12,
			completionCount: 4,
			firstCompletedAt: '2026-01-01T00:00:00Z',
			lastCompletedAt: '2026-01-04T00:00:00Z'
		})
		expect(result.completionCount).toBe(4)
		expect(result.lastCompletedAt).toBe('2026-01-04T00:00:00Z')
	})

	it('rejects a row missing lastCompletedAt', () => {
		expect(() =>
			decode({
				userId: 'user-1',
				username: 'alice',
				bestTurns: 12,
				completionCount: 1,
				firstCompletedAt: '2026-01-01T00:00:00Z'
			})
		).toThrow(/Expected|Missing|Invalid|check/i)
	})
})
