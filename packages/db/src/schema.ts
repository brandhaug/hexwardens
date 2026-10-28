import { sql } from 'drizzle-orm'
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text
} from 'drizzle-orm/sqlite-core'
import { achievementIds } from '@hexwardens/game-logic/achievements/registry'
import { dailyChallengeIds } from '@hexwardens/game-logic/daily-challenge/registry'
import { difficulties } from '@hexwardens/game-logic/difficulty'
import { type Tribe, tribes } from '@hexwardens/game-logic/domains/tribe'
import {
	savedMatchStatuses,
	type SavedMatchRecord
} from '@hexwardens/game-logic/match/saved-match'
import { mapSizes } from '@hexwardens/game-logic/multiplayer/types'

// Cosmetics live entirely in the game-server (profile-only, no gameplay
// effect). The literal is colocated here so the column's enum constraint and
// the API DTO's literal union share a single source of truth.
export const cosmeticSlots = ['banner', 'plaque', 'badge'] as const
export type CosmeticSlot = (typeof cosmeticSlots)[number]

export type StoredMatchPlayer = {
	readonly playerId: string
	readonly username: string
	readonly tribe: Tribe
	readonly isBot: boolean
}

// --- better-auth tables ---

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	email: text('email').unique().notNull(),
	name: text('name').notNull(),
	image: text('image'),
	username: text('username').unique(),
	displayUsername: text('displayUsername'),
	emailVerified: integer('emailVerified', { mode: 'boolean' })
		.default(false)
		.notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
})

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
		token: text('token').unique().notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		ipAddress: text('ipAddress'),
		userAgent: text('userAgent'),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [index('session_userId_idx').on(table.userId)]
)

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('accountId').notNull(),
		providerId: text('providerId').notNull(),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('accessToken'),
		refreshToken: text('refreshToken'),
		idToken: text('idToken'),
		accessTokenExpiresAt: integer('accessTokenExpiresAt', {
			mode: 'timestamp'
		}),
		refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
			mode: 'timestamp'
		}),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('createdAt', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [index('account_userId_idx').on(table.userId)]
)

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
)

// --- game tables (written by game-server) ---

export const matchResults = sqliteTable('match_results', {
	matchId: text('match_id').primaryKey(),
	winnerTribe: text('winner_tribe'),
	players: text('players', { mode: 'json' })
		.$type<readonly StoredMatchPlayer[]>()
		.notNull(),
	duration: integer('duration').notNull(),
	turnCount: integer('turn_count').notNull(),
	mapSize: text('map_size').notNull(),
	completedAt: text('completed_at').notNull()
})

export const playerMatchResults = sqliteTable(
	'player_match_results',
	{
		matchId: text('match_id')
			.notNull()
			.references(() => matchResults.matchId),
		playerId: text('player_id').notNull(),
		username: text('username').notNull(),
		tribe: text('tribe', { enum: tribes }).notNull(),
		isWinner: integer('is_winner', { mode: 'boolean' }).notNull(),
		isBot: integer('is_bot', { mode: 'boolean' }).notNull(),
		completedAt: text('completed_at').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.matchId, table.playerId] }),
		index('idx_pmr_player_completed').on(
			table.playerId,
			sql`${table.completedAt} DESC`
		),
		index('idx_pmr_tribe_winner').on(table.tribe, table.isWinner)
	]
)

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert
export type Account = typeof account.$inferSelect
export type NewAccount = typeof account.$inferInsert
export type Verification = typeof verification.$inferSelect
export type NewVerification = typeof verification.$inferInsert
export type MatchResultRow = typeof matchResults.$inferSelect
export type NewMatchResultRow = typeof matchResults.$inferInsert
export type PlayerMatchResult = typeof playerMatchResults.$inferSelect
export type NewPlayerMatchResult = typeof playerMatchResults.$inferInsert

/**
 * Daily Challenge per-user best result for a given UTC date. Best-only
 * upserts: a worse `bestTurns` never displaces an existing row. The
 * leaderboard query is a single read scoped to one `daily_date`. Written
 * passively by the game-server when a Public Queue Match ends — see
 * ADR-0008.
 */
export const dailyResults = sqliteTable(
	'daily_results',
	{
		userId: text('user_id').notNull(),
		dailyDate: text('daily_date').notNull(),
		username: text('username').notNull(),
		challengeId: text('challenge_id', { enum: dailyChallengeIds })
			.notNull()
			.default('capture-five-villages'),
		bestTurns: integer('best_turns').notNull(),
		completionCount: integer('completion_count').notNull().default(1),
		firstCompletedAt: text('first_completed_at').notNull(),
		lastCompletedAt: text('last_completed_at').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.dailyDate] }),
		index('idx_daily_results_date_turns').on(table.dailyDate, table.bestTurns),
		index('idx_daily_results_user_date').on(table.userId, table.dailyDate)
	]
)

export type DailyResult = typeof dailyResults.$inferSelect
export type NewDailyResult = typeof dailyResults.$inferInsert

/**
 * Achievement unlocks. The composite primary key `(user_id, achievement_id)`
 * makes the write idempotent — replays from the match server never produce
 * duplicate rows. `match_id` is nullable so backfills or non-match unlocks
 * (e.g. daily-challenge streaks) can be inserted without inventing fake IDs.
 * `achievement_id` is a free string so adding entries to the in-code registry
 * does not require a schema migration.
 */
export const achievementUnlocks = sqliteTable(
	'achievement_unlocks',
	{
		userId: text('user_id').notNull(),
		achievementId: text('achievement_id', { enum: achievementIds }).notNull(),
		unlockedAt: text('unlocked_at').notNull(),
		matchId: text('match_id')
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.achievementId] }),
		index('idx_achievement_unlocks_user').on(table.userId)
	]
)

export type AchievementUnlockRow = typeof achievementUnlocks.$inferSelect
export type NewAchievementUnlockRow = typeof achievementUnlocks.$inferInsert

// --- cosmetic progression (profile-only, no gameplay effects) ---

export const cosmeticAcknowledgements = sqliteTable(
	'cosmetic_acknowledgements',
	{
		playerId: text('player_id').notNull(),
		unlockId: text('unlock_id').notNull(),
		acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [primaryKey({ columns: [table.playerId, table.unlockId] })]
)

export const cosmeticEquips = sqliteTable(
	'cosmetic_equips',
	{
		playerId: text('player_id').notNull(),
		slot: text('slot', { enum: cosmeticSlots }).notNull(),
		unlockId: text('unlock_id').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [primaryKey({ columns: [table.playerId, table.slot] })]
)

export type CosmeticAcknowledgement =
	typeof cosmeticAcknowledgements.$inferSelect
export type NewCosmeticAcknowledgement =
	typeof cosmeticAcknowledgements.$inferInsert
export type CosmeticEquip = typeof cosmeticEquips.$inferSelect
export type NewCosmeticEquip = typeof cosmeticEquips.$inferInsert

// --- single-player Saved Match sync ---

export const savedMatches = sqliteTable('saved_matches', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	savedMatchId: text('saved_match_id').notNull(),
	revision: integer('revision').notNull(),
	baseRevision: integer('base_revision'),
	status: text('status', { enum: savedMatchStatuses }).notNull(),
	schemaVersion: integer('schema_version').notNull(),
	gameLogicVersion: text('game_logic_version').notNull(),
	playerTribe: text('player_tribe', { enum: tribes }).notNull(),
	mapSize: text('map_size', { enum: mapSizes }).notNull(),
	opponentCount: integer('opponent_count').notNull(),
	difficulty: text('difficulty', { enum: difficulties }).notNull(),
	turn: integer('turn').notNull(),
	winner: text('winner', { enum: tribes }),
	updatedAt: text('updated_at').notNull(),
	payload: text('payload', { mode: 'json' }).$type<SavedMatchRecord>().notNull()
})

export type SavedMatchRow = typeof savedMatches.$inferSelect
export type NewSavedMatchRow = typeof savedMatches.$inferInsert
