import { Context, Effect, Layer, Schema } from 'effect'
import { and, asc, count, eq, lt, or } from 'drizzle-orm'
import { Database, query, type DatabaseError } from '@hexwardens/db/effect'
import { dailyResults } from '@hexwardens/db/schema'
import {
	addDays,
	isDailyDate,
	type DailyDate
} from '@hexwardens/game-logic/daily-challenge/seed'
import {
	DAILY_CHALLENGE_REGISTRY,
	type DailyChallengeId
} from '@hexwardens/game-logic/daily-challenge/registry'
import { dailyChallengeForDate } from '@hexwardens/game-logic/daily-challenge/rotation'
import {
	type DailyBest,
	type DailyChallengeCoreView,
	type DailyChallengeMeta,
	type DailyLeaderboardEntry
} from '@hexwardens/api/daily'

export type DailyChallengeView = Omit<DailyChallengeCoreView, 'date'> & {
	readonly date: DailyDate
}

export type DailyAuthedUser = { readonly id: string; readonly username: string }

/**
 * Input to {@link Daily.upsertCompletion}. Written by the game-server's
 * Match-end handler when a Player completes the day's Daily Challenge in a
 * Public Queue Match they did not forfeit.
 */
export type DailyCompletionInput = {
	readonly userId: string
	readonly username: string
	readonly dailyDate: DailyDate
	readonly challengeId: DailyChallengeId
	readonly turns: number
}

export type DailyCompletionOutcome = {
	readonly improved: boolean
	readonly best: DailyBest
}

const DEFAULT_LIMIT = 10

function challengeMeta(challengeId: DailyChallengeId): DailyChallengeMeta {
	const def = DAILY_CHALLENGE_REGISTRY[challengeId]
	return {
		challengeId: def.id,
		name: def.name,
		description: def.description,
		target: def.target
	}
}

export class InvalidDailyDate extends Schema.TaggedError<InvalidDailyDate>()(
	'InvalidDailyDate',
	{}
) {}

type DailyService = {
	readonly view: (
		date: DailyDate,
		user: DailyAuthedUser | null
	) => Effect.Effect<DailyChallengeView, DatabaseError | InvalidDailyDate>
	readonly upsertCompletion: (
		input: DailyCompletionInput
	) => Effect.Effect<DailyCompletionOutcome, DatabaseError | InvalidDailyDate>
	readonly currentStreak: (
		userId: string,
		today: DailyDate
	) => Effect.Effect<number, DatabaseError | InvalidDailyDate>
}

export class Daily extends Context.Service<Daily, DailyService>()('Daily') {}

export const DailyLive: Layer.Layer<Daily, never, Database> = Layer.effect(
	Daily,
	Effect.gen(function* () {
		const database = yield* Database
		const runQuery = <A>(
			eff: Effect.Effect<A, DatabaseError, Database>
		): Effect.Effect<A, DatabaseError> =>
			eff.pipe(Effect.provideService(Database, database))

		const view = Effect.fn('Daily.view')(function* (
			date: DailyDate,
			user: DailyAuthedUser | null
		) {
			if (!isDailyDate(date)) {
				return yield* new InvalidDailyDate()
			}
			const [topRows, callerRow, countRow] = yield* runQuery(
				query('daily.viewTop', (db) =>
					Promise.all([
						db
							.select()
							.from(dailyResults)
							.where(eq(dailyResults.dailyDate, date))
							.orderBy(
								asc(dailyResults.bestTurns),
								asc(dailyResults.firstCompletedAt),
								asc(dailyResults.userId)
							)
							.limit(DEFAULT_LIMIT)
							.all(),
						user
							? db
									.select()
									.from(dailyResults)
									.where(
										and(
											eq(dailyResults.userId, user.id),
											eq(dailyResults.dailyDate, date)
										)
									)
									.get()
							: Promise.resolve(undefined),
						db
							.select({ c: count() })
							.from(dailyResults)
							.where(eq(dailyResults.dailyDate, date))
							.get()
					])
				)
			)

			const entries: DailyLeaderboardEntry[] = topRows.map((row) => ({
				userId: row.userId,
				username: row.username,
				bestTurns: row.bestTurns,
				firstCompletedAt: row.firstCompletedAt
			}))

			const callerBest: DailyBest | null = callerRow
				? {
						userId: callerRow.userId,
						username: callerRow.username,
						bestTurns: callerRow.bestTurns,
						completionCount: callerRow.completionCount,
						firstCompletedAt: callerRow.firstCompletedAt,
						lastCompletedAt: callerRow.lastCompletedAt
					}
				: null

			let callerRank: number | null = null
			if (callerBest) {
				const rankRow = yield* runQuery(
					query('daily.callerRank', (db) =>
						db
							.select({ c: count() })
							.from(dailyResults)
							.where(
								and(
									eq(dailyResults.dailyDate, date),
									or(
										lt(dailyResults.bestTurns, callerBest.bestTurns),
										and(
											eq(dailyResults.bestTurns, callerBest.bestTurns),
											lt(
												dailyResults.firstCompletedAt,
												callerBest.firstCompletedAt
											)
										),
										and(
											eq(dailyResults.bestTurns, callerBest.bestTurns),
											eq(
												dailyResults.firstCompletedAt,
												callerBest.firstCompletedAt
											),
											lt(dailyResults.userId, callerBest.userId)
										)
									)
								)
							)
							.get()
					)
				)
				callerRank = (rankRow?.c ?? 0) + 1
			}

			return {
				date,
				challenge: challengeMeta(dailyChallengeForDate(date)),
				entries,
				callerBest,
				callerRank,
				completionCount: countRow?.c ?? 0
			} satisfies DailyChallengeView
		})

		const upsertCompletion = Effect.fn('Daily.upsertCompletion')(function* (
			input: DailyCompletionInput
		) {
			if (!isDailyDate(input.dailyDate)) {
				return yield* new InvalidDailyDate()
			}
			const now = new Date().toISOString()

			const existing = yield* runQuery(
				query('daily.upsertRead', (db) =>
					db
						.select()
						.from(dailyResults)
						.where(
							and(
								eq(dailyResults.userId, input.userId),
								eq(dailyResults.dailyDate, input.dailyDate)
							)
						)
						.get()
				)
			)

			if (!existing) {
				yield* runQuery(
					query('daily.upsertInsert', (db) =>
						db
							.insert(dailyResults)
							.values({
								userId: input.userId,
								dailyDate: input.dailyDate,
								username: input.username,
								challengeId: input.challengeId,
								bestTurns: input.turns,
								completionCount: 1,
								firstCompletedAt: now,
								lastCompletedAt: now
							})
							.run()
					)
				)
				return {
					improved: true,
					best: {
						userId: input.userId,
						username: input.username,
						bestTurns: input.turns,
						completionCount: 1,
						firstCompletedAt: now,
						lastCompletedAt: now
					}
				} satisfies DailyCompletionOutcome
			}

			const improved = input.turns < existing.bestTurns
			const nextCompletionCount = existing.completionCount + 1

			if (improved) {
				yield* runQuery(
					query('daily.upsertUpdateImproved', (db) =>
						db
							.update(dailyResults)
							.set({
								username: input.username,
								challengeId: input.challengeId,
								bestTurns: input.turns,
								completionCount: nextCompletionCount,
								lastCompletedAt: now
							})
							.where(
								and(
									eq(dailyResults.userId, input.userId),
									eq(dailyResults.dailyDate, input.dailyDate)
								)
							)
							.run()
					)
				)
				return {
					improved: true,
					best: {
						userId: existing.userId,
						username: input.username,
						bestTurns: input.turns,
						completionCount: nextCompletionCount,
						firstCompletedAt: existing.firstCompletedAt,
						lastCompletedAt: now
					}
				} satisfies DailyCompletionOutcome
			}

			yield* runQuery(
				query('daily.upsertUpdateAttempt', (db) =>
					db
						.update(dailyResults)
						.set({ completionCount: nextCompletionCount, lastCompletedAt: now })
						.where(
							and(
								eq(dailyResults.userId, input.userId),
								eq(dailyResults.dailyDate, input.dailyDate)
							)
						)
						.run()
				)
			)

			return {
				improved: false,
				best: {
					userId: existing.userId,
					username: existing.username,
					bestTurns: existing.bestTurns,
					completionCount: nextCompletionCount,
					firstCompletedAt: existing.firstCompletedAt,
					lastCompletedAt: now
				}
			} satisfies DailyCompletionOutcome
		})

		const currentStreak = Effect.fn('Daily.streak')(function* (
			userId: string,
			today: DailyDate
		) {
			if (!isDailyDate(today)) {
				return yield* new InvalidDailyDate()
			}
			let cursor = today
			let streak = 0
			const MAX_STREAK_PROBE = 366
			for (let i = 0; i < MAX_STREAK_PROBE; i++) {
				const probeDate = cursor
				const row = yield* runQuery(
					query('daily.streakProbe', (db) =>
						db
							.select({ c: count() })
							.from(dailyResults)
							.where(
								and(
									eq(dailyResults.userId, userId),
									eq(dailyResults.dailyDate, probeDate)
								)
							)
							.get()
					)
				)
				if ((row?.c ?? 0) === 0) {
					break
				}
				streak += 1
				cursor = addDays(cursor, -1)
			}
			return streak
		})

		return { view, upsertCompletion, currentStreak }
	})
)
