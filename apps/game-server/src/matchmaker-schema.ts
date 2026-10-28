import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { difficulties } from '@hexwardens/game-logic/difficulty'
import { tribes } from '@hexwardens/game-logic/domains/tribe'

const lobbyKinds = ['private', 'publicQueue'] as const

export const lobbies = sqliteTable('lobbies', {
	id: text('id').primaryKey(),
	inviteCode: text('invite_code').unique().notNull(),
	kind: text('kind', { enum: lobbyKinds }).default('private').notNull(),
	hostPlayerId: text('host_player_id').notNull(),
	config: text('config').notNull(),
	createdAt: integer('created_at').notNull()
})

export const lobbyPlayers = sqliteTable(
	'lobby_players',
	{
		lobbyId: text('lobby_id')
			.notNull()
			.references(() => lobbies.id, { onDelete: 'cascade' }),
		playerId: text('player_id').notNull(),
		username: text('username').notNull(),
		tribe: text('tribe', { enum: tribes }),
		isBot: integer('is_bot', { mode: 'boolean' }).default(false).notNull(),
		botDifficulty: text('bot_difficulty', { enum: difficulties })
			.default('Beginner')
			.notNull(),
		isReady: integer('is_ready', { mode: 'boolean' }).default(false).notNull(),
		isHost: integer('is_host', { mode: 'boolean' }).default(false).notNull(),
		slotIndex: integer('slot_index').notNull()
	},
	(table) => [primaryKey({ columns: [table.lobbyId, table.playerId] })]
)
