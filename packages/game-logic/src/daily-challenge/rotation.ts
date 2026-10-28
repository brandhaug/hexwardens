import { dailyChallengeIds, type DailyChallengeId } from './registry'
import { dailyDateToSeed, type DailyDate } from './seed'

/**
 * Pick today's active Daily Challenge ID by deterministic rotation over the
 * registry. Indexed by `dailyDateToSeed(date) % registry.length` so all
 * Players in the world see the same challenge on the same UTC day, and so
 * adding a second entry to the registry is purely additive.
 *
 * With one entry the modulo is degenerate; the function exists to keep the
 * call-site stable as the registry grows.
 */
export function dailyChallengeForDate(date: DailyDate): DailyChallengeId {
	const index = dailyDateToSeed(date) % dailyChallengeIds.length
	const id = dailyChallengeIds[index]
	if (!id) {
		throw new Error('daily challenge registry is empty')
	}
	return id
}
