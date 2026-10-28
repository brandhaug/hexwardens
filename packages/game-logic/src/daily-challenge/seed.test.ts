import { dailyDateFromUTC, dailyDateToSeed, isDailyDate } from './seed'

describe('dailyDateFromUTC', () => {
	it('formats a UTC instant as YYYY-MM-DD', () => {
		const at = new Date(Date.UTC(2026, 0, 1, 12, 34, 56))
		expect(dailyDateFromUTC(at)).toBe('2026-01-01')
	})

	it('crosses the UTC midnight boundary cleanly', () => {
		const justBefore = new Date(Date.UTC(2026, 4, 4, 23, 59, 59))
		const justAfter = new Date(Date.UTC(2026, 4, 5, 0, 0, 0))
		expect(dailyDateFromUTC(justBefore)).toBe('2026-05-04')
		expect(dailyDateFromUTC(justAfter)).toBe('2026-05-05')
	})

	it('zero-pads single-digit month and day', () => {
		const at = new Date(Date.UTC(2026, 0, 5, 0, 0, 0))
		expect(dailyDateFromUTC(at)).toBe('2026-01-05')
	})
})

describe('dailyDateToSeed', () => {
	it('parses YYYY-MM-DD into the integer YYYYMMDD', () => {
		expect(dailyDateToSeed('2026-01-01')).toBe(20_260_101)
		expect(dailyDateToSeed('2026-05-05')).toBe(20_260_505)
		expect(dailyDateToSeed('2026-12-31')).toBe(20_261_231)
	})

	it('is stable across calls — same input always maps to same seed', () => {
		expect(dailyDateToSeed('2026-05-05')).toBe(dailyDateToSeed('2026-05-05'))
	})
})

describe('isDailyDate', () => {
	it('accepts well-formed YYYY-MM-DD', () => {
		expect(isDailyDate('2026-01-01')).toBe(true)
		expect(isDailyDate('2026-12-31')).toBe(true)
	})

	it('rejects malformed values', () => {
		expect(isDailyDate('2026-1-1')).toBe(false)
		expect(isDailyDate('20260101')).toBe(false)
		expect(isDailyDate('not-a-date')).toBe(false)
		expect(isDailyDate('')).toBe(false)
		expect(isDailyDate('2026-13-01')).toBe(false)
		expect(isDailyDate('2026-02-30')).toBe(false)
	})
})
