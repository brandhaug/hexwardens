// Fallback `cloudflare:workers` module for environments without the Cloudflare
// Vite plugin (local dev + Playwright e2e). Backs `env.DB` with a real,
// Miniflare-managed D1 (workerd in-process) so auth flows and other binding-
// dependent routes work end-to-end against the same runtime production uses.
//
// In dev (HEXWARDENS_USE_WORKERS_SHIM=1) the shim shares a SQLite file with the
// game-server's `wrangler dev` instance via a repo-root `.wrangler-dev`
// directory and the same `database_id` (`placeholder`) declared in
// `apps/game-server/wrangler.jsonc`. This preserves the prod invariant that
// both apps see one D1: a user signed up in web is visible to game-server's
// profile/leaderboard reads.
//
// In tests (HEXWARDENS_USE_WORKERS_SHIM_MEMORY=1, set by vitest setup) the shim
// falls back to an in-memory D1 so each test run starts clean. Migrations are
// tracked in the shared Wrangler migration ledger. Other env vars fall through to
// `process.env` (loaded from `.env`).
import { Schema } from 'effect'
import { type MiniflareOptions, Miniflare } from 'miniflare'
import {
	localDatabaseId,
	localPersistDirectory,
	workerCompatibility
} from '../../../../infra/bindings.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const workspaceRoot =
	process.env.HEXWARDENS_WORKSPACE_ROOT ??
	join(import.meta.dirname, '..', '..', '..', '..')
const migrationsDir = join(workspaceRoot, 'packages', 'db', 'migrations')

const useMemory = process.env.HEXWARDENS_USE_WORKERS_SHIM_MEMORY === '1'

const wranglerPersistRoot =
	process.env.HEXWARDENS_WRANGLER_PERSIST_TO ??
	join(workspaceRoot, localPersistDirectory)

// Shared persist root mirroring `wrangler dev --persist-to <repo>/.wrangler-dev`
// for the game-server. Miniflare writes to `<persistRoot>/d1/miniflare-D1DatabaseObject/<id>.sqlite`
// where <id> is derived from the database_id below — keep this in sync with
// `apps/game-server/wrangler.jsonc:d1_databases[0].database_id`.
const persistRoot = join(wranglerPersistRoot, 'v3')
const DATABASE_ID = localDatabaseId

const options: MiniflareOptions = {
	cf: false,
	workers: [
		{
			config: {
				name: 'hexwardens-local-bindings',
				compatibilityDate: workerCompatibility.date,
				compatibilityFlags: workerCompatibility.flags,
				manifest: {
					mainModule: 'shim.mjs',
					modules: {
						'shim.mjs': {
							type: 'esm',
							contents: 'export default { fetch() { return new Response() } }'
						}
					}
				},
				env: { DB: { type: 'd1', id: DATABASE_ID } }
			}
		}
	]
}
if (!useMemory) {
	options.resourcePersistencePath = persistRoot
}
const mf = new Miniflare(options)

const DB = await mf.getD1Database('DB')

// Share Wrangler's migration ledger. A schema probe alone misses every migration
// added after the first launch. D1 batch applies each migration atomically with
// its ledger entry, so a crash cannot leave the migration half-recorded.
await DB.prepare(
	'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)'
).run()
const files = readdirSync(migrationsDir)
	.filter((file) => file.endsWith('.sql'))
	.toSorted()
for (const file of files) {
	const applied = await DB.prepare(
		'SELECT name FROM d1_migrations WHERE name = ?'
	)
		.bind(file)
		.first()
	if (applied !== null) {
		continue
	}
	const statements = readFileSync(join(migrationsDir, file), 'utf8')
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter(Boolean)
	// The old shim applied the initial schema without recording a ledger. Adopt
	// only that one baseline, and only when every table/index definition agrees.
	// Later migrations must always run through the ledger normally.
	if (file === '0000_initial_schema.sql') {
		const existing = await DB.prepare(
			"SELECT name FROM sqlite_master WHERE name = 'user'"
		).first()
		if (existing !== null) {
			const baseline = new DatabaseSync(':memory:')
			try {
				for (const statement of statements) {
					baseline.exec(statement)
				}
				const expected = Schema.decodeUnknownSync(
					Schema.Array(
						Schema.Struct({ name: Schema.String, sql: Schema.String })
					)
				)(
					baseline
						.prepare(
							"SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
						)
						.all()
				)
				for (const entry of expected) {
					const live = await DB.prepare(
						'SELECT sql FROM sqlite_master WHERE name = ?'
					)
						.bind(entry.name)
						.first<{ sql: string }>()
					if (
						live?.sql.replaceAll(/\s+/g, ' ').trim() !==
						entry.sql.replaceAll(/\s+/g, ' ').trim()
					) {
						throw new Error(
							'Legacy local D1 differs from the baseline. Export it before reconciling migrations; no data was changed.'
						)
					}
				}
				await DB.prepare('INSERT INTO d1_migrations (name) VALUES (?)')
					.bind(file)
					.run()
				continue
			} finally {
				baseline.close()
			}
		}
	}
	await DB.batch([
		...statements.map((statement) => DB.prepare(statement)),
		DB.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(file)
	])
}

export function disposeLocalDatabase(): Promise<void> {
	return mf.dispose()
}

function requiredEnv(name: string): string {
	const value = process.env[name]
	if (value === undefined || value.length === 0) {
		throw new Error(`${name} is required`)
	}
	return value
}

export const env: Cloudflare.Env = {
	DB,
	get BETTER_AUTH_SECRET() {
		return requiredEnv('BETTER_AUTH_SECRET')
	},
	get BETTER_AUTH_URL() {
		return requiredEnv('BETTER_AUTH_URL')
	},
	get BETTER_AUTH_TRUSTED_ORIGINS() {
		return process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? ''
	},
	get AUTH_JWT_SECRET() {
		return requiredEnv('AUTH_JWT_SECRET')
	},
	get GAME_SERVER_URL() {
		return requiredEnv('GAME_SERVER_URL')
	}
}
