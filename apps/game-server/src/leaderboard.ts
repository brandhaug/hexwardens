import { Context, Effect, Layer, Option } from 'effect'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { isTribe, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { Database, query, type DatabaseError } from '@hexwardens/db/effect'
import { MatchId, PlayerId, Username } from '@hexwardens/game-logic/ids'
import { playerMatchResults, user } from '@hexwardens/db/schema'
import { type LeaderboardSort } from '@hexwardens/api/leaderboard'

export type LeaderboardArgs = {
	sort: LeaderboardSort
	tribe?: Tribe | undefined
	minMatches?: number | undefined
} & PageArgs

export type PageArgs = {
	limit: number
	offset: number
}

export type LeaderboardEntry = {
	playerId: PlayerId
	username: Username
	wins: number
	losses: number
	matches: number
	winRate: number
}

export type LeaderboardPage = {
	entries: LeaderboardEntry[]
	total: number
}

export type OverallStats = {
	wins: number
	losses: number
	matches: number
	winRate: number
}

export type TribeStats = {
	tribe: Tribe
	wins: number
	losses: number
	matches: number
	winRate: number
}

export type PlayerProfile = {
	user: { playerId: PlayerId; username: Username }
	overallStats: OverallStats
	tribeStats: TribeStats[]
}

export type MatchHistoryEntry = {
	matchId: MatchId
	tribe: Tribe
	isWinner: boolean
	completedAt: string
}

function buildStats(wins: number, matches: number): OverallStats {
	return {
		wins,
		losses: matches - wins,
		matches,
		winRate: matches === 0 ? 0 : wins / matches
	}
}

type LeaderboardService = {
	readonly getLeaderboard: (
		args: LeaderboardArgs
	) => Effect.Effect<LeaderboardPage, DatabaseError>
	readonly getMatchHistory: (
		playerId: PlayerId,
		page: PageArgs
	) => Effect.Effect<MatchHistoryEntry[], DatabaseError>
	readonly getPlayerProfile: (
		username: Username
	) => Effect.Effect<Option.Option<PlayerProfile>, DatabaseError>
}

export class Leaderboard extends Context.Service<
	Leaderboard,
	LeaderboardService
>()('Leaderboard') {}

export const LeaderboardLive: Layer.Layer<Leaderboard, never, Database> =
	Layer.effect(
		Leaderboard,
		Effect.gen(function* () {
			const database = yield* Database
			const runQuery = <A>(
				effect: Effect.Effect<A, DatabaseError, Database>
			): Effect.Effect<A, DatabaseError> =>
				effect.pipe(Effect.provideService(Database, database))

			const getLeaderboard = Effect.fn('Leaderboard.getLeaderboard')(function* (
				args: LeaderboardArgs
			) {
				const { limit, offset, tribe, minMatches } = args

				const whereClause =
					tribe === undefined
						? eq(playerMatchResults.isBot, false)
						: and(
								eq(playerMatchResults.isBot, false),
								eq(playerMatchResults.tribe, tribe)
							)

				const winsExpr = sql<number>`SUM(${playerMatchResults.isWinner})`
				const matchesExpr = count()
				const winRateExpr = sql`(CAST(SUM(${playerMatchResults.isWinner}) AS REAL) / COUNT(*))`
				// Prefer the current canonical username from `user`; fall back to the most
				// recent historical handle in player_match_results for players without a
				// current user row (e.g. deleted accounts).
				const usernameExpr = sql<string>`COALESCE(${user.username}, MAX(${playerMatchResults.username}))`

				const orderBy = {
					wins: sql`${winsExpr} DESC, ${winRateExpr} DESC, ${usernameExpr} ASC`,
					winRate: sql`${winRateExpr} DESC, ${winsExpr} DESC, ${usernameExpr} ASC`,
					matches: sql`${matchesExpr} DESC, ${winsExpr} DESC, ${usernameExpr} ASC`
				}[args.sort]

				const having =
					minMatches === undefined ? undefined : sql`COUNT(*) >= ${minMatches}`

				const [rows, totalRow] = yield* runQuery(
					query('leaderboard.read', (db) =>
						Promise.all([
							db
								.select({
									playerId: playerMatchResults.playerId,
									username: usernameExpr.as('username'),
									wins: winsExpr.as('wins'),
									matches: matchesExpr.as('matches')
								})
								.from(playerMatchResults)
								.leftJoin(user, eq(user.id, playerMatchResults.playerId))
								.where(whereClause)
								.groupBy(playerMatchResults.playerId, user.username)
								.having(having)
								.orderBy(orderBy)
								.limit(limit)
								.offset(offset)
								.all(),
							db
								.select({ total: count() })
								.from(
									db
										.select({ playerId: playerMatchResults.playerId })
										.from(playerMatchResults)
										.where(whereClause)
										.groupBy(playerMatchResults.playerId)
										.having(having)
										.as('grouped')
								)
								.get()
						])
					)
				)

				const entries: LeaderboardEntry[] = rows.map((row) =>
					Object.assign(buildStats(row.wins, row.matches), {
						playerId: PlayerId.make(row.playerId),
						username: Username.make(row.username)
					})
				)

				const page: LeaderboardPage = {
					entries,
					total: totalRow?.total ?? 0
				}
				return page
			})

			const getMatchHistory = Effect.fn('Leaderboard.getMatchHistory')(
				function* (playerId: PlayerId, page: PageArgs) {
					const rows = yield* runQuery(
						query('matchHistory.read', (db) =>
							db
								.select({
									matchId: playerMatchResults.matchId,
									tribe: playerMatchResults.tribe,
									isWinner: playerMatchResults.isWinner,
									completedAt: playerMatchResults.completedAt
								})
								.from(playerMatchResults)
								.where(eq(playerMatchResults.playerId, playerId))
								.orderBy(
									desc(playerMatchResults.completedAt),
									desc(playerMatchResults.matchId)
								)
								.limit(page.limit)
								.offset(page.offset)
								.all()
						)
					)

					const out: MatchHistoryEntry[] = []
					for (const row of rows) {
						if (!isTribe(row.tribe)) {
							continue
						}
						out.push({
							matchId: MatchId.make(row.matchId),
							tribe: row.tribe,
							isWinner: row.isWinner,
							completedAt: row.completedAt
						})
					}
					return out
				}
			)

			const getPlayerProfile = Effect.fn('Leaderboard.getPlayerProfile')(
				function* (username: Username) {
					// Lookup is case-insensitive and also tolerates rows where the
					// `username` column is null — better-auth's username plugin normalizes
					// to lowercase on `username` and stores the original case in
					// `displayUsername`. Some legacy/auth flows leave `username` null and
					// the player still has an identity via `displayUsername` or `name`.
					const userRow = yield* runQuery(
						query('playerProfile.user', (db) =>
							db
								.select({
									id: user.id,
									username: user.username,
									displayUsername: user.displayUsername,
									name: user.name
								})
								.from(user)
								.where(
									sql`lower(${user.username}) = lower(${username}) OR lower(${user.displayUsername}) = lower(${username}) OR lower(${user.name}) = lower(${username})`
								)
								.limit(1)
								.get()
						)
					)

					const resolvedUsername =
						userRow?.username ?? userRow?.displayUsername ?? userRow?.name
					if (!userRow || !resolvedUsername) {
						return Option.none<PlayerProfile>()
					}
					const playerId = userRow.id

					const playerFilter = and(
						eq(playerMatchResults.playerId, playerId),
						eq(playerMatchResults.isBot, false)
					)

					const [overallRow, tribeRows] = yield* runQuery(
						query('playerProfile.stats', (db) =>
							Promise.all([
								db
									.select({
										wins: sql<number>`SUM(${playerMatchResults.isWinner})`.as(
											'wins'
										),
										matches: count()
									})
									.from(playerMatchResults)
									.where(playerFilter)
									.get(),
								db
									.select({
										tribe: playerMatchResults.tribe,
										wins: sql<number>`SUM(${playerMatchResults.isWinner})`.as(
											'wins'
										),
										matches: count()
									})
									.from(playerMatchResults)
									.where(playerFilter)
									.groupBy(playerMatchResults.tribe)
									.all()
							])
						)
					)

					const wins = overallRow?.wins ?? 0
					const matches = overallRow?.matches ?? 0

					const tribeStats: TribeStats[] = []
					for (const row of tribeRows) {
						if (!isTribe(row.tribe)) {
							continue
						}
						tribeStats.push({
							tribe: row.tribe,
							...buildStats(row.wins, row.matches)
						})
					}

					const profile: PlayerProfile = {
						user: {
							playerId: PlayerId.make(playerId),
							username: Username.make(resolvedUsername)
						},
						overallStats: buildStats(wins, matches),
						tribeStats
					}
					return Option.some(profile)
				}
			)

			return { getLeaderboard, getMatchHistory, getPlayerProfile }
		})
	)
