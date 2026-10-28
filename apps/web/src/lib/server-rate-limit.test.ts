// oxlint-disable-next-line anti-slop/no-module-mocking -- Supply the Worker host binding without starting Miniflare; exercise the real limiter.
vi.mock('cloudflare:workers', () => ({ env: process.env }))
import { checkServerRateLimit } from '@/lib/server-rate-limit'

describe('checkServerRateLimit', () => {
	it('limits per client and resets after the window', () => {
		const request = new Request('https://hexwardens.example/_serverFn', {
			headers: { 'CF-Connecting-IP': '203.0.113.20' }
		})
		const rule = { windowMs: 1000, maxRequests: 2 }
		expect(
			checkServerRateLimit(request, 'client_error_test', rule, 0).kind
		).toBe('ok')
		expect(
			checkServerRateLimit(request, 'client_error_test', rule, 0).kind
		).toBe('ok')
		const limited = checkServerRateLimit(request, 'client_error_test', rule, 0)
		expect(limited.kind).toBe('limited')
		expect(
			checkServerRateLimit(request, 'client_error_test', rule, 1001).kind
		).toBe('ok')
	})

	it('reports the seconds remaining in the window when limited', () => {
		const request = new Request('https://hexwardens.example/_serverFn', {
			headers: { 'CF-Connecting-IP': '203.0.113.21' }
		})
		const rule = { windowMs: 60_000, maxRequests: 1 }
		expect(
			checkServerRateLimit(request, 'retry_after_test', rule, 0).kind
		).toBe('ok')
		expect(
			checkServerRateLimit(request, 'retry_after_test', rule, 15_000)
		).toEqual({
			kind: 'limited',
			retryAfterSeconds: 45
		})
	})

	it('shares an anonymous bucket when only forwarded headers are present', () => {
		const rule = { windowMs: 60_000, maxRequests: 1 }
		const limited = new Request('https://hexwardens.example/_serverFn', {
			headers: { 'X-Forwarded-For': '198.51.100.7, 70.41.3.18' }
		})
		const other = new Request('https://hexwardens.example/_serverFn', {
			headers: { 'X-Forwarded-For': '198.51.100.8' }
		})
		expect(checkServerRateLimit(limited, 'xff_test', rule, 0).kind).toBe('ok')
		expect(checkServerRateLimit(limited, 'xff_test', rule, 0).kind).toBe(
			'limited'
		)
		expect(checkServerRateLimit(other, 'xff_test', rule, 0).kind).toBe(
			'limited'
		)
	})
})

describe('server function rate limiting', () => {
	it('does not let forwarded headers create new anonymous buckets', () => {
		const rule = { windowMs: 60_000, maxRequests: 1 }
		const first = new Request('https://game.example/', {
			headers: { 'X-Forwarded-For': '192.0.2.1' }
		})
		const rotated = new Request('https://game.example/', {
			headers: { 'X-Forwarded-For': '192.0.2.2', 'True-Client-IP': '192.0.2.3' }
		})
		expect(checkServerRateLimit(first, 'test-unkeyed', rule, 0).kind).toBe('ok')
		expect(checkServerRateLimit(rotated, 'test-unkeyed', rule, 0).kind).toBe(
			'limited'
		)
	})

	it('separates platform IPs and resets an expired window', () => {
		const rule = { windowMs: 60_000, maxRequests: 1 }
		const first = new Request('https://game.example/', {
			headers: { 'CF-Connecting-IP': '192.0.2.10' }
		})
		const second = new Request('https://game.example/', {
			headers: { 'CF-Connecting-IP': '192.0.2.11' }
		})
		expect(checkServerRateLimit(first, 'test-platform', rule, 0).kind).toBe(
			'ok'
		)
		expect(checkServerRateLimit(first, 'test-platform', rule, 1).kind).toBe(
			'limited'
		)
		expect(checkServerRateLimit(second, 'test-platform', rule, 1).kind).toBe(
			'ok'
		)
		expect(
			checkServerRateLimit(first, 'test-platform', rule, 60_000).kind
		).toBe('ok')
	})
})

describe('development limiter bypass', () => {
	afterEach(() => vi.unstubAllEnvs())

	it.each([
		['https://web.example', 'http://localhost:3001', false],
		['http://localhost:3001', 'https://web.example', false],
		['http://localhost:3001', '', false],
		['http://localhost:3001', 'http://localhost:3001', true]
	])(
		'requires a local request and configuration: %s / %s',
		(host, origin, bypass) => {
			vi.stubEnv('HEXWARDENS_DISABLE_RATE_LIMIT', '1')
			vi.stubEnv('BETTER_AUTH_URL', origin)
			vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', '')
			const request = new Request(`${host}/_serverFn`)
			const rule = { windowMs: 60_000, maxRequests: 1 }
			const scope = `bypass-${host}-${origin}`
			expect(checkServerRateLimit(request, scope, rule, 0).kind).toBe('ok')
			expect(checkServerRateLimit(request, scope, rule, 0).kind).toBe(
				bypass ? 'ok' : 'limited'
			)
		}
	)
})

it('refuses bypass when any configured trusted origin is public', () => {
	vi.stubEnv('HEXWARDENS_DISABLE_RATE_LIMIT', '1')
	vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3001')
	vi.stubEnv(
		'BETTER_AUTH_TRUSTED_ORIGINS',
		'http://localhost:3001,https://web.example'
	)
	const request = new Request('http://localhost:3001/_serverFn')
	const rule = { windowMs: 60_000, maxRequests: 1 }
	expect(checkServerRateLimit(request, 'mixed-config', rule, 0).kind).toBe('ok')
	expect(checkServerRateLimit(request, 'mixed-config', rule, 0).kind).toBe(
		'limited'
	)
	vi.unstubAllEnvs()
})
