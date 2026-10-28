import { type ChronicleEntry } from '../match/chronicle/chronicle-entry'
import { type Tribe } from '../domains/tribe'
import { includesValue } from '../type-utils'

/**
 * Daily Challenge IDs are stable string literals — they identify rows in D1
 * (`daily_results.challenge_id`) and are sent over the wire. Renaming an ID
 * is a breaking change. Adding new IDs requires no schema migration.
 */
export const dailyChallengeIds = ['capture-five-villages'] as const

export type DailyChallengeId = (typeof dailyChallengeIds)[number]

/**
 * Result of running a Daily Challenge's evaluator over the Match's chronicle
 * for a given Tribe. `progress` is capped at `target`; overflow (e.g. capturing
 * a sixth Village after the fifth) is not represented — `completed` and
 * `completedAtTurn` carry that signal.
 */
export type DailyChallengeProgress = {
	readonly progress: number
	readonly target: number
	readonly completed: boolean
	/** Turn on which `progress` first reached `target`, or `null` if not yet. */
	readonly completedAtTurn: number | null
}

export type DailyChallengeDefinition = {
	readonly id: DailyChallengeId
	readonly name: string
	readonly description: string
	readonly target: number
	/**
	 * Pure projection over the Match's structured chronicle, filtered to one
	 * Tribe. Same function runs server-side at Match-end for authoritative
	 * completion and client-side for the in-Match HUD progress display.
	 */
	readonly evaluate: (
		entries: readonly ChronicleEntry[],
		tribe: Tribe
	) => DailyChallengeProgress
}

const CAPTURE_FIVE_VILLAGES_TARGET = 5

const captureFiveVillages: DailyChallengeDefinition = {
	id: 'capture-five-villages',
	name: 'Land Grab',
	description: 'Capture 5 Villages in a single Public Queue Match.',
	target: CAPTURE_FIVE_VILLAGES_TARGET,
	evaluate: (entries, tribe) => {
		let count = 0
		let completedAtTurn: number | null = null
		for (const entry of entries) {
			if (entry.kind !== 'villageCaptured') {
				continue
			}
			if (entry.actorTribe !== tribe) {
				continue
			}
			count += 1
			if (count === CAPTURE_FIVE_VILLAGES_TARGET) {
				completedAtTurn = entry.turn
				break
			}
		}
		const progress =
			count < CAPTURE_FIVE_VILLAGES_TARGET
				? count
				: CAPTURE_FIVE_VILLAGES_TARGET
		return {
			progress,
			target: CAPTURE_FIVE_VILLAGES_TARGET,
			completed: completedAtTurn !== null,
			completedAtTurn
		}
	}
}

export const DAILY_CHALLENGE_REGISTRY: Readonly<
	Record<DailyChallengeId, DailyChallengeDefinition>
> = {
	'capture-five-villages': captureFiveVillages
}

export const DAILY_CHALLENGE_LIST: readonly DailyChallengeDefinition[] =
	dailyChallengeIds.map((id) => DAILY_CHALLENGE_REGISTRY[id])

export function isDailyChallengeId(value: unknown): value is DailyChallengeId {
	return includesValue(dailyChallengeIds, value)
}
