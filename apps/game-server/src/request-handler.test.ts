import { Effect } from 'effect'
import { Miniflare } from 'miniflare'
import { handleFetch } from './request-handler'
import { type Env } from './types'

// oxlint-disable-next-line anti-slop/no-module-mocking -- Presence loads the Worker-only base class; lobby tests never use the presence API.
vi.mock('./presence', () => ({ presenceCount: () => Promise.resolve(0) }))

// Real host namespaces let the request boundary route requests without replacing
// the limiter, CORS policy, configuration parser or logging implementation.
describe('request scoped limiter development flag', () => {
	it.each([
		{
			path: '/lobby/create',
			limit: 30,
			host: 'https://game.example',
			origins: 'https://web.example',
			bypass: false
		},
		{
			path: '/lobby/public-queue',
			limit: 20,
			host: 'https://game.example',
			origins: 'https://web.example',
			bypass: false
		},
		{
			path: '/lobby/create',
			limit: 30,
			host: 'http://localhost:8787',
			origins: 'http://localhost:3001',
			bypass: true
		}
	])(
		'honors scoped limits at $host$path',
		async ({ path, limit, host, origins, bypass }) => {
			const mf = new Miniflare({
				cf: false,
				workers: [
					{
						config: {
							name: 'test',
							compatibilityDate: '2026-09-28',
							manifest: {
								mainModule: 'fixture.mjs',
								modules: {
									'fixture.mjs': {
										type: 'esm',
										contents: `export class Target { fetch() { return new Response('routed') } }
 export default { fetch() { return new Response('unused') } }`
									}
								}
							},
							exports: {
								Target: { type: 'durable-object', storage: 'sqlite' }
							},
							env: {
								MATCHMAKER: {
									type: 'durable-object',
									worker: 'test',
									exportName: 'Target'
								},
								MATCH: {
									type: 'durable-object',
									worker: 'test',
									exportName: 'Target'
								},
								PRESENCE: {
									type: 'durable-object',
									worker: 'test',
									exportName: 'Target'
								},
								DB: { type: 'd1', id: 'fixture' },
								AUTH_JWT_SECRET: {
									type: 'text',
									value: 'test-secret-long-enough-for-tests'
								},
								ALLOWED_ORIGIN: { type: 'text', value: origins },
								HEXWARDENS_DISABLE_RATE_LIMIT: { type: 'text', value: '1' }
							}
						}
					}
				]
			})
			const log = vi.spyOn(console, 'log').mockImplementation(() => {})
			try {
				const bindings = await mf.getBindings<Env>()
				const native = vi.fn<() => Promise<{ success: boolean }>>(() =>
					Promise.resolve({ success: true })
				)
				const env = { ...bindings, GAME_RATE_LIMITER: { limit: native } }
				const request = new Request(`${host}${path}`, {
					method: 'POST',
					headers: { 'CF-Connecting-IP': `${host}-${path}` }
				})
				for (let index = 0; index < limit; index++) {
					const response = await Effect.runPromise(handleFetch(request, env))
					expect(response.status).toBe(200)
				}
				const response = await Effect.runPromise(handleFetch(request, env))
				expect(response.status).toBe(bypass ? 200 : 429)
				expect(native).toHaveBeenCalledTimes(limit + 1)
				expect(log).toHaveBeenCalledTimes(limit + 1)
			} finally {
				log.mockRestore()
				await mf.dispose()
			}
		}
	)
})
