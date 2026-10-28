import { Schema } from 'effect'
import { MatchHistoryEntry } from '@hexwardens/api/profile'

describe('MatchHistoryEntry DTO', () => {
	const decode = Schema.decodeUnknownSync(MatchHistoryEntry)

	it('decodes a winning-row projection', () => {
		const result = decode({
			matchId: 'm-1',
			tribe: 'barbarians',
			isWinner: true,
			completedAt: '2026-01-01T00:00:00Z'
		})
		expect(result).toEqual({
			matchId: 'm-1',
			tribe: 'barbarians',
			isWinner: true,
			completedAt: '2026-01-01T00:00:00Z'
		})
	})

	it('rejects an unknown tribe string', () => {
		expect(() =>
			decode({
				matchId: 'm-1',
				tribe: 'not-a-real-tribe',
				isWinner: false,
				completedAt: '2026-01-01T00:00:00Z'
			})
		).toThrow(/Expected|Missing|Invalid|check/i)
	})

	it('rejects an entry missing matchId', () => {
		expect(() =>
			decode({
				tribe: 'rogues',
				isWinner: false,
				completedAt: '2026-01-01T00:00:00Z'
			})
		).toThrow(/Expected|Missing|Invalid|check/i)
	})

	it('rejects non-boolean isWinner', () => {
		expect(() =>
			decode({
				matchId: 'm-1',
				tribe: 'rogues',
				isWinner: 'true',
				completedAt: '2026-01-01T00:00:00Z'
			})
		).toThrow(/Expected|Missing|Invalid|check/i)
	})
})
