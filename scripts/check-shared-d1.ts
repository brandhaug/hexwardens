// Integration probe: two independent runtimes against temporary shared D1.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'hexwardens-shared-d1-'))
process.env.HEXWARDENS_WRANGLER_PERSIST_TO = directory
process.env.HEXWARDENS_USE_WORKERS_SHIM_MEMORY = '0'
try {
	const shim = await import('../apps/web/src/lib/cloudflare-workers-shim.ts')
	try {
		await shim.env.DB.prepare(
			'CREATE TABLE shared_d1_probe (value TEXT NOT NULL)'
		).run()
		await shim.env.DB.prepare(
			"INSERT INTO shared_d1_probe VALUES ('web-visible-to-game')"
		).run()
	} finally {
		await shim.disposeLocalDatabase()
	}
	const wrangler = join(root, 'apps/game-server/node_modules/.bin/wrangler')
	async function run(args: string[]) {
		const result = await exec(
			wrangler,
			[
				'd1',
				...args,
				'--local',
				'--config',
				join(root, 'apps/game-server/wrangler.jsonc'),
				'--persist-to',
				directory
			],
			{
				encoding: 'utf8',
				timeout: 30_000,
				env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
			}
		)
		return result.stdout
	}
	assert.match(
		await run([
			'execute',
			'hexwardens-db',
			'--json',
			'--command',
			'SELECT value FROM shared_d1_probe'
		]),
		/web-visible-to-game/
	)
	assert.match(
		await run(['migrations', 'apply', 'hexwardens-db']),
		/No migrations to apply/
	)
	await run([
		'execute',
		'hexwardens-db',
		'--command',
		'DROP TABLE d1_migrations'
	])
	await exec(
		process.execPath,
		[
			'-e',
			"import('./apps/web/src/lib/cloudflare-workers-shim.ts').then(shim => shim.disposeLocalDatabase())"
		],
		{ cwd: root, encoding: 'utf8', timeout: 30_000, env: process.env }
	)
	assert.match(
		await run([
			'execute',
			'hexwardens-db',
			'--json',
			'--command',
			'SELECT value FROM shared_d1_probe'
		]),
		/web-visible-to-game/
	)
	assert.match(
		await run(['migrations', 'apply', 'hexwardens-db']),
		/No migrations to apply/
	)
	process.stdout.write(
		'PASS: shared D1 visibility, matching migration history, and legacy baseline adoption without data loss.\n'
	)
} finally {
	rmSync(directory, { recursive: true, force: true })
}
