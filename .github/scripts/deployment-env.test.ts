import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { deploymentOrigins } from '../../infra/bindings.ts'
import { resolveDeploymentEnvironment } from '../../infra/deployment-env.ts'

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

describe('deployment origin resolution', () => {
	it('derives production URLs without copying URLs into GitHub secrets', () => {
		vi.stubEnv('BETTER_AUTH_URL', '')
		vi.stubEnv('GAME_SERVER_URL', '')
		vi.stubEnv('CLOUDFLARE_WORKERS_SUBDOMAIN', 'example')
		expect(deploymentOrigins('prod')).toEqual({
			web: 'https://hexwardens-web.example.workers.dev',
			gameServer: 'https://hexwardens-game-server.example.workers.dev'
		})
	})

	it('never inherits production origins in a preview', () => {
		vi.stubEnv('BETTER_AUTH_URL', 'https://game.example.com')
		vi.stubEnv('GAME_SERVER_URL', 'https://api.example.com')
		vi.stubEnv('CLOUDFLARE_WORKERS_SUBDOMAIN', 'preview-account')
		expect(deploymentOrigins('pr-7')).toEqual({
			web: 'https://hexwardens-pr-7-web.preview-account.workers.dev',
			gameServer:
				'https://hexwardens-pr-7-game-server.preview-account.workers.dev'
		})
	})

	it('rejects malformed discovery responses before constructing deploy URLs', async () => {
		vi.stubEnv('BETTER_AUTH_URL', '')
		vi.stubEnv('GAME_SERVER_URL', '')
		vi.stubEnv('CLOUDFLARE_WORKERS_SUBDOMAIN', '')
		vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'a'.repeat(32))
		vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-only-token')
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					success: true,
					result: { subdomain: 'bad\nGITHUB_ENV=value' }
				})
			)
		)
		await expect(resolveDeploymentEnvironment('prod')).rejects.toThrow(
			/subdomain/
		)
	})

	it('discovers and validates the account subdomain', async () => {
		vi.stubEnv('BETTER_AUTH_URL', '')
		vi.stubEnv('GAME_SERVER_URL', '')
		vi.stubEnv('CLOUDFLARE_WORKERS_SUBDOMAIN', '')
		vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'a'.repeat(32))
		vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-only-token')
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					success: true,
					result: { subdomain: 'example' }
				})
			)
		)
		await expect(resolveDeploymentEnvironment('prod')).resolves.toEqual({
			web: 'https://hexwardens-web.example.workers.dev',
			gameServer: 'https://hexwardens-game-server.example.workers.dev'
		})
	})
})
