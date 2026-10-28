import { type Difficulty } from '../difficulty'
import { type Tribe } from '../domains/tribe'
import { includesValue } from '../type-utils'

/**
 * Achievement IDs are stable string literals — they identify rows in D1 and
 * are sent over the wire. Renaming an ID is a breaking change. Adding new
 * IDs requires no schema migration.
 */
export const achievementIds = [
	'first-win',
	'beat-beginner-bot',
	'beat-intermediate-bot',
	'beat-expert-bot',
	'win-as-each-tribe',
	'ten-ranked-wins',
	'win-without-losing-capital',
	'win-in-under-twenty-turns',
	'capture-first-capital',
	'daily-challenge-streak-3'
] as const

export type AchievementId = (typeof achievementIds)[number]

export type AchievementDefinition = {
	readonly id: AchievementId
	readonly name: string
	readonly description: string
}

/**
 * Static registry — UI looks up names/descriptions from this map by ID.
 * Display order on the profile page mirrors {@link achievementIds} order.
 */
export const ACHIEVEMENT_REGISTRY: Readonly<
	Record<AchievementId, AchievementDefinition>
> = {
	'first-win': {
		id: 'first-win',
		name: 'First Blood',
		description: 'Win your first ranked match.'
	},
	'beat-beginner-bot': {
		id: 'beat-beginner-bot',
		name: 'Squire',
		description: 'Defeat a Beginner-difficulty bot.'
	},
	'beat-intermediate-bot': {
		id: 'beat-intermediate-bot',
		name: 'Sprinter',
		description: 'Defeat an Intermediate-difficulty bot.'
	},
	'beat-expert-bot': {
		id: 'beat-expert-bot',
		name: 'Champion',
		description: 'Defeat an Expert-difficulty bot.'
	},
	'win-as-each-tribe': {
		id: 'win-as-each-tribe',
		name: 'Many Banners',
		description: 'Claim victory at least once with every tribe.'
	},
	'ten-ranked-wins': {
		id: 'ten-ranked-wins',
		name: 'Decade of Glory',
		description: 'Win ten ranked matches in total.'
	},
	'win-without-losing-capital': {
		id: 'win-without-losing-capital',
		name: 'Throne Unbroken',
		description: 'Win a match without ever losing your capital.'
	},
	'win-in-under-twenty-turns': {
		id: 'win-in-under-twenty-turns',
		name: 'Lightning Campaign',
		description: 'Win a match in fewer than twenty turns.'
	},
	'capture-first-capital': {
		id: 'capture-first-capital',
		name: 'Capital Offence',
		description: 'Capture an enemy capital for the first time.'
	},
	'daily-challenge-streak-3': {
		id: 'daily-challenge-streak-3',
		name: 'Steady Hand',
		description: 'Complete the daily challenge three days in a row.'
	}
}

export const ACHIEVEMENT_LIST: readonly AchievementDefinition[] =
	achievementIds.map((id) => ACHIEVEMENT_REGISTRY[id])

export function isAchievementId(value: unknown): value is AchievementId {
	return includesValue(achievementIds, value)
}

/**
 * Per-player snapshot facts the evaluator needs but cannot derive from a
 * single match result. Provided by the persistence layer (and, eventually,
 * the daily-challenge feature). Optional fields default to "no contribution"
 * — missing data must never *unlock* an achievement that has not been earned.
 */
export type AchievementSideInputs = {
	/**
	 * Total ranked wins this player has *before* the current match,
	 * counting bot wins. The current match's win is not included.
	 */
	readonly priorWinCount?: number
	/** Tribes the player has previously won at least one match with. */
	readonly priorWinningTribes?: ReadonlySet<Tribe>
	/**
	 * `true` when the player owned a capital at the start of the match and
	 * never lost it during the match. Defaults to `false` (conservative).
	 */
	readonly capitalHeldAllMatch?: boolean
	/** Number of enemy capitals captured by this player during the match. */
	readonly enemyCapitalsCapturedThisMatch?: number
	/** Whether the player has ever captured an enemy capital before. */
	readonly hasCapturedEnemyCapitalPreviously?: boolean
	/** Current daily-challenge consecutive completion streak. */
	readonly dailyChallengeStreak?: number
}

/**
 * Difficulty of the highest bot the player defeated this match (only when
 * the player won and faced bots). `null` when the player lost or no bots
 * were present.
 */
export type DefeatedBotDifficulty = Difficulty | null
