import { checkHttpRateLimit, rateLimitScopeForRequest } from './http-rate-limit'

describe('http rate limit', () => {
	it('classifies lobby mutation and WebSocket upgrade scopes', () => {
		expect(
			rateLimitScopeForRequest(
				new Request('https://game.example/lobby/create', { method: 'POST' }),
				new URL('https://game.example/lobby/create')
			)
		).toBe('lobby_create')
		expect(
			rateLimitScopeForRequest(
				new Request('https://game.example/match/m-1', {
					headers: { Upgrade: 'websocket' }
				}),
				new URL('https://game.example/match/m-1')
			)
		).toBe('match_ws')
		expect(
			rateLimitScopeForRequest(
				new Request('https://game.example/health'),
				new URL('https://game.example/health')
			)
		).toBeNull()
	})

	it('limits by client address and scope', () => {
		const request = new Request('https://game.example/lobby/public-queue', {
			method: 'POST',
			headers: { 'CF-Connecting-IP': '203.0.113.10' }
		})
		let result = checkHttpRateLimit(request, 'public_queue', 0)
		for (let i = 0; i < 20; i++) {
			result = checkHttpRateLimit(request, 'public_queue', 0)
		}
		expect(result.kind).toBe('limited')
		expect(checkHttpRateLimit(request, 'lobby_create', 0).kind).toBe('ok')
		expect(checkHttpRateLimit(request, 'public_queue', 61_000).kind).toBe('ok')
	})

	it('reports the seconds remaining in the window when limited', () => {
		const request = new Request('https://game.example/lobby/create', {
			method: 'POST',
			headers: { 'CF-Connecting-IP': '203.0.113.11' }
		})
		for (let i = 0; i < 30; i++) {
			expect(checkHttpRateLimit(request, 'lobby_create', 0).kind).toBe('ok')
		}
		expect(checkHttpRateLimit(request, 'lobby_create', 15_000)).toEqual({
			kind: 'limited',
			retryAfterSeconds: 45
		})
	})

	it('does not trust rotating forwarded headers when the platform IP is absent', () => {
		const limited = new Request('https://game.example/lobby/public-queue', {
			method: 'POST',
			headers: { 'X-Forwarded-For': '198.51.100.7, 70.41.3.18' }
		})
		const other = new Request('https://game.example/lobby/public-queue', {
			method: 'POST',
			headers: {
				'X-Forwarded-For': '198.51.100.8',
				'True-Client-IP': '198.51.100.9'
			}
		})
		for (let i = 0; i < 20; i++) {
			expect(checkHttpRateLimit(limited, 'public_queue', 0).kind).toBe('ok')
		}
		expect(checkHttpRateLimit(limited, 'public_queue', 0).kind).toBe('limited')
		expect(checkHttpRateLimit(other, 'public_queue', 0).kind).toBe('limited')
	})
})

describe('development bypass with native protection', () => {
	it.each([
		['https://game.example', 'https://web.example', false],
		['https://game.example', 'http://localhost:3001', false],
		['http://localhost:8787', 'https://web.example', false],
		[
			'http://localhost:8787',
			'http://localhost:3001,https://web.example',
			false
		],
		['http://localhost:8787', '', false],
		['http://localhost:8787', 'http://localhost:3001', true],
		['http://localhost:8787', '*', true]
	])('keeps scoped limits for %s with %s', async (host, origins, bypass) => {
		const { checkPlatformRateLimit } = await import('./platform-rate-limit')
		const request = new Request(`${host}/lobby/create`, {
			method: 'POST',
			headers: { 'CF-Connecting-IP': `probe-${host}-${origins}` }
		})
		expect(
			await checkPlatformRateLimit(
				request,
				{
					limit: () => Promise.resolve({ success: true })
				},
				origins
			)
		).toBeNull()
		const scope = rateLimitScopeForRequest(
			request,
			new URL(request.url),
			'1',
			origins
		)
		let limited = false
		if (scope !== null) {
			for (let count = 0; count < 31; count++) {
				limited = checkHttpRateLimit(request, scope, 0).kind === 'limited'
			}
		}
		expect(limited).toBe(!bypass)
	})
})
