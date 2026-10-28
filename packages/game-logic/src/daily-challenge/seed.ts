import { Predicate } from 'effect'
/**
 * Daily Challenge — date primitives.
 *
 * The daily challenge uses the UTC date as the only coordination surface:
 * everyone playing on the same UTC day plays the same map, so the seed is the
 * date alone. We canonicalise the date as `YYYY-MM-DD` and derive the board
 * seed by parsing it as the integer `YYYYMMDD`.
 */

export type DailyDate = string

const DAILY_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Format a UTC instant as `YYYY-MM-DD`.
 *
 * Uses only the UTC components — local timezone is intentionally ignored so
 * that midnight UTC is a global boundary.
 */
export function dailyDateFromUTC(at: Date): DailyDate {
	const year = at.getUTCFullYear()
	const month = at.getUTCMonth() + 1
	const day = at.getUTCDate()
	return `${pad4(year)}-${pad2(month)}-${pad2(day)}`
}

/** Today's daily date, computed from `Date.now()`. */
export function todayDailyDate(now: () => number = Date.now): DailyDate {
	return dailyDateFromUTC(new Date(now()))
}

/**
 * Map a daily date to a numeric seed for `generateBoard`.
 *
 * Encoded as `YYYYMMDD` so the seed is monotonic with calendar order and
 * trivially debuggable.
 */
export function dailyDateToSeed(date: DailyDate): number {
	const match = DAILY_DATE_REGEX.exec(date)
	if (!match) {
		throw new Error(`Invalid daily date: ${date}`)
	}
	const [, y, m, d] = match
	return Number.parseInt(`${y}${m}${d}`, 10)
}

/** Type guard for `YYYY-MM-DD` shaped strings with valid month/day. */
export function isDailyDate(value: unknown): value is DailyDate {
	if (!Predicate.isString(value)) {
		return false
	}
	const match = DAILY_DATE_REGEX.exec(value)
	if (!match) {
		return false
	}
	const [, y, m, d] = match
	if (y === undefined || m === undefined || d === undefined) {
		return false
	}
	const year = Number.parseInt(y, 10)
	const month = Number.parseInt(m, 10)
	const day = Number.parseInt(d, 10)
	if (month < 1 || month > 12) {
		return false
	}
	if (day < 1 || day > 31) {
		return false
	}
	// Round-trip through Date to reject impossible day-of-month
	// (e.g. February 30). UTC components by construction.
	const probe = new Date(Date.UTC(year, month - 1, day))
	return (
		probe.getUTCFullYear() === year &&
		probe.getUTCMonth() === month - 1 &&
		probe.getUTCDate() === day
	)
}

/**
 * Step a daily date by a signed number of UTC days. Used by the streak
 * helper to walk the calendar backwards from "today".
 */
export function addDays(date: DailyDate, delta: number): DailyDate {
	const seed = dailyDateToSeed(date)
	const year = Math.floor(seed / 10_000)
	const month = Math.floor((seed % 10_000) / 100)
	const day = seed % 100
	const next = new Date(Date.UTC(year, month - 1, day + delta))
	return dailyDateFromUTC(next)
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n)
}

function pad4(n: number): string {
	if (n >= 1000) {
		return String(n)
	}
	if (n >= 100) {
		return `0${n}`
	}
	if (n >= 10) {
		return `00${n}`
	}
	return `000${n}`
}
