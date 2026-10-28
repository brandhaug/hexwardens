import { tribes, type Tribe } from '../domains/tribe'
import {
	achievementIds,
	type AchievementId,
	type AchievementSideInputs,
	type DefeatedBotDifficulty
} from './registry'

/**
 * Pure evaluator input. Built by callers from a `MatchResult` plus the
 * player-specific facts the persistence layer knows (`sideInputs`).
 */
export type AchievementContext = {
	readonly playerWon: boolean
	readonly tribe: Tribe
	readonly turnCount: number
	readonly defeatedBotDifficulty: DefeatedBotDifficulty
	readonly completedAt: string
	readonly priorUnlockedIds: ReadonlySet<AchievementId>
	readonly sideInputs: AchievementSideInputs
}

export type AchievementUnlock = {
	readonly id: AchievementId
	readonly unlockedAt: string
}

/**
 * Pure rule for a single achievement. Returning `true` unlocks the achievement
 * (subject to the "already-unlocked" filter applied uniformly by
 * {@link evaluateAchievements}). Rules MUST be conservative: missing data
 * never unlocks.
 */
type Rule = (ctx: AchievementContext) => boolean

const isWinAsEachTribe: Rule = (ctx) => {
	if (!ctx.playerWon) {
		return false
	}
	const prior = ctx.sideInputs.priorWinningTribes
	if (!prior) {
		return false
	}
	const haveAfter = new Set<Tribe>(prior)
	haveAfter.add(ctx.tribe)
	for (const tribe of tribes) {
		if (!haveAfter.has(tribe)) {
			return false
		}
	}
	return true
}

const RULES: Readonly<Record<AchievementId, Rule>> = {
	'first-win': (ctx) =>
		ctx.playerWon &&
		(ctx.sideInputs.priorWinCount ?? Number.POSITIVE_INFINITY) === 0,

	'beat-beginner-bot': (ctx) =>
		ctx.playerWon && ctx.defeatedBotDifficulty === 'Beginner',

	'beat-intermediate-bot': (ctx) =>
		ctx.playerWon && ctx.defeatedBotDifficulty === 'Intermediate',

	'beat-expert-bot': (ctx) =>
		ctx.playerWon && ctx.defeatedBotDifficulty === 'Expert',

	'win-as-each-tribe': isWinAsEachTribe,

	'ten-ranked-wins': (ctx) =>
		ctx.playerWon && (ctx.sideInputs.priorWinCount ?? -1) + 1 >= 10,

	'win-without-losing-capital': (ctx) =>
		ctx.playerWon && ctx.sideInputs.capitalHeldAllMatch === true,

	'win-in-under-twenty-turns': (ctx) => ctx.playerWon && ctx.turnCount < 20,

	'capture-first-capital': (ctx) =>
		(ctx.sideInputs.enemyCapitalsCapturedThisMatch ?? 0) > 0 &&
		ctx.sideInputs.hasCapturedEnemyCapitalPreviously !== true,

	'daily-challenge-streak-3': (ctx) =>
		(ctx.sideInputs.dailyChallengeStreak ?? 0) >= 3
}

/**
 * Pure: evaluates every rule against the supplied context and returns the set
 * of newly-unlocked achievements. Already-unlocked IDs are filtered out
 * uniformly; rules don't need to know prior state.
 */
export function evaluateAchievements(
	ctx: AchievementContext
): readonly AchievementUnlock[] {
	const unlocks: AchievementUnlock[] = []
	for (const id of achievementIds) {
		if (ctx.priorUnlockedIds.has(id)) {
			continue
		}
		if (RULES[id](ctx)) {
			unlocks.push({ id, unlockedAt: ctx.completedAt })
		}
	}
	return unlocks
}
