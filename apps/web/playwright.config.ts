import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const isCI = !!process.env.CI
const webPort = process.env.HEXWARDENS_E2E_WEB_PORT ?? '3001'
const baseURL = `http://localhost:${webPort}`
const webCommand = isCI
	? `pnpm run build && pnpm run serve --port ${webPort}`
	: `pnpm run dev --port ${webPort} --strictPort`
const GAME_SERVER_PORT = 8787
// 127.0.0.1, not localhost: wrangler dev binds IPv4 only; Node fetch resolves localhost to ::1.
const gameServerURL = `http://127.0.0.1:${GAME_SERVER_PORT}`
// Fresh per-run D1 state in CI only — runners are ephemeral, so the dirs
// don't accumulate and `reuseExistingServer` is off. Locally both servers
// keep the fixed shared path: overriding it here would split a reused dev
// server and a freshly started game-server across different databases.
const e2ePersistEnv: Record<string, string> = process.env.CI
	? {
			HEXWARDENS_WRANGLER_PERSIST_TO: `../../.wrangler-dev/e2e-${Date.now()}-${process.pid}`
		}
	: {}

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 2 : 1,
	// Auth flows hit a Miniflare-backed D1 in-process via the workers shim;
	// throughput per dev server saturates above ~1 worker. Run serially.
	workers: 1,
	reporter: isCI ? [['blob'], ['github']] : 'list',
	use: {
		baseURL,
		ignoreHTTPSErrors: true,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				channel: 'chromium',
				// Select the same software GPU locally and on CI. The fallback
				// opt-in alone leaves backend selection to the host.
				// https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
				launchOptions: {
					args: [
						'--use-gl=angle',
						'--use-angle=swiftshader',
						'--enable-unsafe-swiftshader'
					]
				}
			}
		}
	],
	webServer: [
		{
			command: `pnpm -C ../game-server dev:e2e --var ALLOWED_ORIGIN:${baseURL}`,
			url: `${gameServerURL}/health`,
			reuseExistingServer: !isCI && !process.env.HEXWARDENS_E2E_WEB_PORT,
			gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
			timeout: 120_000,
			env: { HEXWARDENS_DISABLE_RATE_LIMIT: '1', ...e2ePersistEnv },
			stdout: 'pipe',
			stderr: 'pipe'
		},
		{
			command: webCommand,
			url: baseURL,
			ignoreHTTPSErrors: true,
			reuseExistingServer: !isCI && !process.env.HEXWARDENS_E2E_WEB_PORT,
			gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
			timeout: isCI ? 300_000 : 120_000,
			env: {
				BETTER_AUTH_URL: baseURL,
				GAME_SERVER_URL: gameServerURL,
				VITE_GAME_SERVER_URL: gameServerURL,
				HEXWARDENS_WORKSPACE_ROOT: fileURLToPath(
					new URL('../..', import.meta.url)
				),
				HEXWARDENS_DISABLE_RATE_LIMIT: '1',
				...e2ePersistEnv
			},
			stdout: 'pipe',
			stderr: 'pipe'
		}
	]
})
