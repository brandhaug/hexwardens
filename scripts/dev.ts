import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envFile = fileURLToPath(new URL('../.env', import.meta.url))
if (!existsSync(envFile)) {
	throw new Error('Copy .env.example to .env before starting local development')
}
process.loadEnvFile(envFile)
const args =
	process.argv[2] === 'web'
		? ['exec', 'vp', 'run', '--filter', 'web', 'dev']
		: ['exec', 'vp', 'run', '-r', '--parallel', 'dev']
const result = spawnSync('pnpm', args, {
	stdio: 'inherit',
	env: process.env,
	cwd: fileURLToPath(new URL('..', import.meta.url))
})
if (result.error) {
	throw result.error
}
process.exitCode = result.status ?? 1
