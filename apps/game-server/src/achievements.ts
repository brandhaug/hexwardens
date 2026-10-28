import { Context, Effect, Layer } from 'effect'
import { eq } from 'drizzle-orm'
import { Database, query, type DatabaseError } from '@hexwardens/db/effect'
import {
	achievementUnlocks,
	playerMatchResults,
	user
} from '@hexwardens/db/schema'
import {
	type AchievementId,
	isAchievementId
} from '@hexwardens/game-logic/achievements/registry'
import {
	evaluateAchievements,
	type AchievementContext,
	type AchievementUnlock
} from '@hexwardens/game-logic/achievements/evaluate'
import { isTribe, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import { type MatchConfig, type MatchResult } from './types'

type StoredUnlock = {
	readonly achievementId: AchievementId
	readonly unlockedAt: string
	readonly matchId: string | null
}

type EvaluateInput = {
	readonly result: MatchResult
	readonly config: MatchConfig
}

type EvaluateOutput = {
	readonly perTribe: ReadonlyMap<Tribe, readonly AchievementId[]>
}

type AchievementsService = {
	/**
	 * Returns all unlocks for the given user — sorted by `unlockedAt` ASC,
	 * tie-broken by `achievement_id` for deterministic test output.
	 */
	readonly getUnlocks: (
		userId: string
	) => Effect.Effect<readonly StoredUnlock[], DatabaseError>
	/**
	 * Evaluates achievements for every signed-in player in the result and
	 * persists any new unlocks. Idempotent on `(user_id, achievement_id)`.
	 * Returns a per-tribe map of newly-unlocked achievement IDs so the
	 * caller can broadcast toasts. Bots and guests (no `user` row) are
	 * skipped silently.
	 */
	readonly evaluateAndPersist: (
		input: EvaluateInput
	) => Effect.Effect<EvaluateOutput, DatabaseError>
}

export class Achievements extends Context.Service<
	Achievements,
	AchievementsService
>()('Achievements') {}

const DIFFICULTY_RANK: Record<Difficulty, number> = {
	Beginner: 0,
	Intermediate: 1,
	Advanced: 2,
	Expert: 3,
	Legend: 4
}

/**
 * Returns the highest-difficulty bot the human player faced as an opponent,
 * or `null` if there were no bot opponents.
 */
function highestBotOpponentDifficulty(
	config: MatchConfig,
	humanTribe: Tribe
): Difficulty | null {
	let best: Difficulty | null = null
	let bestRank = -1
	for (const player of config.players) {
		if (!player.isBot) {
			continue
		}
		if (player.tribe === humanTribe) {
			continue
		}
		const rank = DIFFICULTY_RANK[player.botDifficulty]
		if (rank > bestRank) {
			bestRank = rank
			best = player.botDifficulty
		}
	}
	return best
}

export const AchievementsLive: Layer.Layer<Achievements, never, Database> =
	Layer.effect(
		Achievements,
		Effect.gen(function* () {
			const database = yield* Database
			const runQuery = <A>(
				effect: Effect.Effect<A, DatabaseError, Database>
			): Effect.Effect<A, DatabaseError> =>
				effect.pipe(Effect.provideService(Database, database))

			const getUnlocks = (userId: string) =>
				runQuery(
					query('Achievements.getUnlocks', async (db) => {
						const rows = await db
							.select({
								achievementId: achievementUnlocks.achievementId,
								unlockedAt: achievementUnlocks.unlockedAt,
								matchId: achievementUnlocks.matchId
							})
							.from(achievementUnlocks)
							.where(eq(achievementUnlocks.userId, userId))
							.all()
						const out: StoredUnlock[] = []
						for (const row of rows) {
							if (!isAchievementId(row.achievementId)) {
								continue
							}
							out.push({
								achievementId: row.achievementId,
								unlockedAt: row.unlockedAt,
								matchId: row.matchId ?? null
							})
						}
						out.sort((a, b) => {
							if (a.unlockedAt !== b.unlockedAt) {
								return a.unlockedAt < b.unlockedAt ? -1 : 1
							}
							return a.achievementId.localeCompare(b.achievementId)
						})
						return out
					})
				)

			const userExists = (id: string) =>
				runQuery(
					query('Achievements.userExists', async (db) => {
						const row = await db
							.select({ id: user.id })
							.from(user)
							.where(eq(user.id, id))
							.get()
						return row?.id !== undefined
					})
				)

			const loadPlayerHistory = (id: string, currentMatchId: string) =>
				runQuery(
					query('Achievements.loadPlayerHistory', async (db) => {
						const matchRows = await db
							.select({
								matchId: playerMatchResults.matchId,
								tribe: playerMatchResults.tribe,
								isWinner: playerMatchResults.isWinner
							})
							.from(playerMatchResults)
							.where(eq(playerMatchResults.playerId, id))
							.all()
						// Filter out the current match — `loadPlayerHistory` runs AFTER
						// `writeMatchResult` so the row is already in the table; without
						// this filter, side inputs would double-count the just-played
						// match and `first-win` could never fire.
						let priorWins = 0
						const priorWinningTribes = new Set<Tribe>()
						for (const row of matchRows) {
							if (row.matchId === currentMatchId) {
								continue
							}
							if (!row.isWinner) {
								continue
							}
							priorWins++
							if (isTribe(row.tribe)) {
								priorWinningTribes.add(row.tribe)
							}
						}
						const unlockRows = await db
							.select({ achievementId: achievementUnlocks.achievementId })
							.from(achievementUnlocks)
							.where(eq(achievementUnlocks.userId, id))
							.all()
						const priorUnlocked = new Set<AchievementId>()
						for (const row of unlockRows) {
							if (isAchievementId(row.achievementId)) {
								priorUnlocked.add(row.achievementId)
							}
						}
						return { priorWins, priorWinningTribes, priorUnlocked }
					})
				)

			const persistUnlocks = (
				userId: string,
				matchId: string,
				unlocks: readonly AchievementUnlock[]
			) =>
				runQuery(
					query('Achievements.persistUnlocks', async (db) => {
						const rows = unlocks.map((u) => ({
							userId,
							achievementId: u.id,
							unlockedAt: u.unlockedAt,
							matchId
						}))
						await db
							.insert(achievementUnlocks)
							.values(rows)
							.onConflictDoNothing()
					})
				)

			const evaluateAndPersist = (input: EvaluateInput) =>
				Effect.gen(function* () {
					const { result, config } = input
					const perTribe = new Map<Tribe, readonly AchievementId[]>()

					for (const player of result.players) {
						if (player.isBot) {
							continue
						}
						const tribe = player.tribe
						if (!isTribe(tribe)) {
							continue
						}

						const exists = yield* userExists(player.playerId)
						if (!exists) {
							continue
						}

						const history = yield* loadPlayerHistory(
							player.playerId,
							result.matchId
						)
						const playerWon = result.winner === tribe

						const ctx: AchievementContext = {
							playerWon,
							tribe,
							turnCount: result.turnCount,
							defeatedBotDifficulty: playerWon
								? highestBotOpponentDifficulty(config, tribe)
								: null,
							completedAt: result.completedAt,
							priorUnlockedIds: history.priorUnlocked,
							sideInputs: {
								priorWinCount: history.priorWins,
								priorWinningTribes: history.priorWinningTribes
							}
						}

						const unlocks = evaluateAchievements(ctx)
						if (unlocks.length === 0) {
							continue
						}

						yield* persistUnlocks(player.playerId, result.matchId, unlocks)
						perTribe.set(
							tribe,
							unlocks.map((u) => u.id)
						)
					}

					return { perTribe }
				})

			return { getUnlocks, evaluateAndPersist }
		})
	)
