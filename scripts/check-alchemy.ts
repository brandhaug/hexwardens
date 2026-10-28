import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const home = mkdtempSync(join(tmpdir(), 'hexwardens-alchemy-smoke-'))
try {
	const env = { ...process.env, ALCHEMY_HOME: home }
	const commands = [
		{
			command: fileURLToPath(
				new URL('../node_modules/.bin/alchemy', import.meta.url)
			),
			args: ['deploy', '--help']
		},
		{
			command: process.execPath,
			args: ['--input-type=module', '-e', "await import('./alchemy.run.ts')"]
		}
	]
	for (const { command, args } of commands) {
		const result = spawnSync(command, args, { env, stdio: 'inherit' })
		if (result.error) {
			throw result.error
		}
		if (result.status !== 0) {
			throw new Error(`Alchemy import smoke check exited with ${result.status}`)
		}
	}
} finally {
	rmSync(home, { recursive: true, force: true })
}
