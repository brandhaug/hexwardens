import { Miniflare } from 'miniflare'
import { workerCompatibility } from '../../../../infra/bindings.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { count } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@hexwardens/db/schema'
import { type Database } from '@hexwardens/db/client'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'

const tables = {
	user: schema.user,
	session: schema.session,
	account: schema.account,
	verification: schema.verification,
	matchResults: schema.matchResults,
	playerMatchResults: schema.playerMatchResults,
	dailyResults: schema.dailyResults,
	achievementUnlocks: schema.achievementUnlocks,
	cosmeticAcknowledgements: schema.cosmeticAcknowledgements,
	cosmeticEquips: schema.cosmeticEquips
}

type TableKey = keyof typeof tables
type InferSelect<T extends TableKey> = (typeof tables)[T] extends {
	$inferSelect: infer R
}
	? R
	: never

export type D1Fixture = {
	readonly db: Database
	readonly d1: D1Database
	countRows(table: TableKey): Promise<number>
	selectAll<T extends TableKey>(table: T): Promise<InferSelect<T>[]>
	close(): Promise<void>
}

export type SeedUser = {
	readonly id: string
	readonly username: string | null
	readonly displayUsername?: string | null
	readonly name?: string
	readonly email?: string
}

export type SeedMatchResultRow = {
	readonly matchId: string
	readonly playerId: string
	readonly username: string
	readonly tribe: Tribe
	readonly isWinner: 0 | 1
	readonly isBot: 0 | 1
	readonly completedAt?: string
}

export async function seedUser(
	fixture: D1Fixture,
	user: SeedUser
): Promise<void> {
	await fixture.db
		.insert(schema.user)
		.values({
			id: user.id,
			email: user.email ?? `${user.id}@example.test`,
			name: user.name ?? user.username ?? user.id,
			username: user.username,
			displayUsername: user.displayUsername ?? null,
			emailVerified: false
		})
		.onConflictDoNothing()
}

export async function seedMatchResults(
	fixture: D1Fixture,
	rows: readonly SeedMatchResultRow[]
): Promise<void> {
	const matchIds = [...new Set(rows.map((r) => r.matchId))]
	for (const id of matchIds) {
		await fixture.db
			.insert(schema.matchResults)
			.values({
				matchId: id,
				winnerTribe: null,
				players: [],
				duration: 0,
				turnCount: 0,
				mapSize: 'small',
				completedAt: '2026-01-01T00:00:00Z'
			})
			.onConflictDoNothing()
	}

	for (const r of rows) {
		await fixture.db.insert(schema.playerMatchResults).values({
			matchId: r.matchId,
			playerId: r.playerId,
			username: r.username,
			tribe: r.tribe,
			isWinner: r.isWinner === 1,
			isBot: r.isBot === 1,
			completedAt: r.completedAt ?? '2026-01-01T00:00:00Z'
		})
	}
}

const migrationsDir = join(
	import.meta.dirname,
	'..',
	'..',
	'..',
	'..',
	'packages',
	'db',
	'migrations'
)

/**
 * Runs tests against a real D1 binding provided by Miniflare (workerd
 * in-process). Same runtime the Cloudflare Worker uses in production — no
 * better-sqlite3 shim, no hand-rolled batch, no type-coercion divergence.
 */
export async function createD1Fixture(): Promise<D1Fixture> {
	const mf = new Miniflare({
		cf: false,
		workers: [
			{
				config: {
					name: 'hexwardens-d1-fixture',
					compatibilityDate: workerCompatibility.date,
					compatibilityFlags: workerCompatibility.flags,
					manifest: {
						mainModule: 'fixture.mjs',
						modules: {
							'fixture.mjs': {
								type: 'esm',
								contents: 'export default { fetch() { return new Response() } }'
							}
						}
					},
					env: { DB: { type: 'd1', id: 'fixture' } }
				}
			}
		]
	})

	const d1 = await mf.getD1Database('DB')

	const files = readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.toSorted()
	for (const file of files) {
		const raw = readFileSync(join(migrationsDir, file), 'utf8')
		for (const stmt of raw.split('--> statement-breakpoint')) {
			const trimmed = stmt.trim()
			if (trimmed.length > 0) {
				await d1.prepare(trimmed).run()
			}
		}
	}

	const db = drizzle(d1)

	// Overload: callers get rows typed per table; the implementation is
	// checked against the loose signature (drizzle cannot relate a generic
	// indexed table access to its inferred row type).
	function selectAll<T extends TableKey>(table: T): Promise<InferSelect<T>[]>
	async function selectAll(table: TableKey): Promise<unknown[]> {
		const target = tables[table]
		return db.select().from(target).all()
	}

	return {
		db,
		d1,
		async countRows(table) {
			const target = tables[table]
			const row = await db.select({ c: count() }).from(target).get()
			return row?.c ?? 0
		},
		selectAll,
		async close() {
			await mf.dispose()
		}
	}
}
