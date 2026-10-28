import {
	applyCorsGate,
	isOriginAllowed,
	parseAllowedOrigins,
	resolveCorsOrigin,
	withCorsOrigin
} from './cors'

describe('parseAllowedOrigins', () => {
	it('returns wildcard policy for "*"', () => {
		const policy = parseAllowedOrigins('*')
		expect(policy.kind).toBe('wildcard')
	})

	it('returns allowlist with single origin', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(policy).toEqual({
			kind: 'allowlist',
			origins: ['https://hexwardens.example']
		})
	})

	it('returns allowlist with multiple comma-separated origins', () => {
		const policy = parseAllowedOrigins(
			'https://hexwardens.example, https://preview.hexwardens.example'
		)
		expect(policy).toEqual({
			kind: 'allowlist',
			origins: [
				'https://hexwardens.example',
				'https://preview.hexwardens.example'
			]
		})
	})

	it('trims whitespace and drops empty entries', () => {
		const policy = parseAllowedOrigins(
			'  https://a.example , , https://b.example ,'
		)
		expect(policy).toEqual({
			kind: 'allowlist',
			origins: ['https://a.example', 'https://b.example']
		})
	})

	it('returns empty allowlist for empty or undefined input', () => {
		expect(parseAllowedOrigins('')).toEqual({ kind: 'allowlist', origins: [] })
		expect(parseAllowedOrigins(undefined)).toEqual({
			kind: 'allowlist',
			origins: []
		})
	})
})

describe('isOriginAllowed', () => {
	it('allows any origin under wildcard policy', () => {
		const policy = parseAllowedOrigins('*')
		expect(isOriginAllowed(policy, 'https://anything.example')).toBe(true)
		expect(isOriginAllowed(policy, null)).toBe(true)
	})

	it('allows exact match in allowlist', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(isOriginAllowed(policy, 'https://hexwardens.example')).toBe(true)
	})

	it('rejects origin not in allowlist', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(isOriginAllowed(policy, 'https://evil.example')).toBe(false)
	})

	it('rejects missing origin under allowlist policy', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(isOriginAllowed(policy, null)).toBe(false)
	})

	it('rejects subdomain-suffix attacks (no partial matching)', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(isOriginAllowed(policy, 'https://hexwardens.example.evil.com')).toBe(
			false
		)
		expect(isOriginAllowed(policy, 'https://evil.com/hexwardens.example')).toBe(
			false
		)
	})

	it('treats scheme as significant', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(isOriginAllowed(policy, 'http://hexwardens.example')).toBe(false)
	})

	it('rejects everything under empty allowlist', () => {
		const policy = parseAllowedOrigins('')
		expect(isOriginAllowed(policy, 'https://hexwardens.example')).toBe(false)
		expect(isOriginAllowed(policy, null)).toBe(false)
	})
})

describe('resolveCorsOrigin', () => {
	it('echoes the request origin when allowlisted', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(resolveCorsOrigin(policy, 'https://hexwardens.example')).toBe(
			'https://hexwardens.example'
		)
	})

	it('returns "*" under wildcard policy', () => {
		const policy = parseAllowedOrigins('*')
		expect(resolveCorsOrigin(policy, 'https://anything.example')).toBe('*')
		expect(resolveCorsOrigin(policy, null)).toBe('*')
	})

	it('returns null when origin is not allowed', () => {
		const policy = parseAllowedOrigins('https://hexwardens.example')
		expect(resolveCorsOrigin(policy, 'https://evil.example')).toBeNull()
		expect(resolveCorsOrigin(policy, null)).toBeNull()
	})
})

describe('applyCorsGate', () => {
	const allowlist = parseAllowedOrigins('https://hexwardens.example')
	const wildcard = parseAllowedOrigins('*')
	const empty = parseAllowedOrigins('')

	it('returns 204 preflight with allowed origin echoed and Vary: Origin', () => {
		const { response, corsOrigin } = applyCorsGate(
			new Request('https://game.example/health', {
				method: 'OPTIONS',
				headers: { Origin: 'https://hexwardens.example' }
			}),
			allowlist
		)
		expect(response?.status).toBe(204)
		expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://hexwardens.example'
		)
		expect(response?.headers.get('Vary')).toBe('Origin')
		expect(corsOrigin).toBe('https://hexwardens.example')
	})

	it('allows tracing headers in preflight (Effect HttpClient sends traceparent)', () => {
		const { response } = applyCorsGate(
			new Request('https://game.example/leaderboard', {
				method: 'OPTIONS',
				headers: {
					Origin: 'https://hexwardens.example',
					'Access-Control-Request-Headers': 'traceparent'
				}
			}),
			allowlist
		)
		const allowHeaders = response?.headers.get('Access-Control-Allow-Headers')
		expect(allowHeaders).toContain('traceparent')
	})

	it('returns 403 preflight when origin not allowed', () => {
		const { response, corsOrigin } = applyCorsGate(
			new Request('https://game.example/health', {
				method: 'OPTIONS',
				headers: { Origin: 'https://evil.example' }
			}),
			allowlist
		)
		expect(response?.status).toBe(403)
		expect(response?.headers.get('Access-Control-Allow-Origin')).toBeNull()
		expect(corsOrigin).toBeNull()
	})

	it('returns 204 preflight with "*" under wildcard policy', () => {
		const { response, corsOrigin } = applyCorsGate(
			new Request('https://game.example/health', {
				method: 'OPTIONS',
				headers: { Origin: 'https://anything.example' }
			}),
			wildcard
		)
		expect(response?.status).toBe(204)
		expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('*')
		expect(corsOrigin).toBe('*')
	})

	it('passes through (response=null) when origin is allowed for non-OPTIONS', () => {
		const { response, corsOrigin } = applyCorsGate(
			new Request('https://game.example/health', {
				headers: { Origin: 'https://hexwardens.example' }
			}),
			allowlist
		)
		expect(response).toBeNull()
		expect(corsOrigin).toBe('https://hexwardens.example')
	})

	it('passes through with null corsOrigin when no Origin header (same-origin or non-browser)', () => {
		const { response, corsOrigin } = applyCorsGate(
			new Request('https://game.example/health'),
			allowlist
		)
		expect(response).toBeNull()
		expect(corsOrigin).toBeNull()
	})

	it('rejects non-OPTIONS request from disallowed origin with 403', () => {
		const { response } = applyCorsGate(
			new Request('https://game.example/health', {
				headers: { Origin: 'https://evil.example' }
			}),
			allowlist
		)
		expect(response?.status).toBe(403)
	})

	it('rejects everything (with Origin header) under empty allowlist', () => {
		const { response } = applyCorsGate(
			new Request('https://game.example/health', {
				headers: { Origin: 'https://hexwardens.example' }
			}),
			empty
		)
		expect(response?.status).toBe(403)
	})
})

describe('withCorsOrigin', () => {
	it('overwrites a DO response that returned wildcard with the resolved origin', () => {
		const original = new Response('{}', {
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			}
		})
		const wrapped = withCorsOrigin(original, 'https://hexwardens.example')
		expect(wrapped.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://hexwardens.example'
		)
		expect(wrapped.headers.get('Vary')).toBe('Origin')
		expect(wrapped.headers.get('Content-Type')).toBe('application/json')
	})

	it('adds the CORS header when the DO did not include one', () => {
		const original = new Response('{}', {
			headers: { 'Content-Type': 'application/json' }
		})
		const wrapped = withCorsOrigin(original, 'https://hexwardens.example')
		expect(wrapped.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://hexwardens.example'
		)
	})

	it('passes through unchanged when corsOrigin is null (same-origin)', () => {
		const original = new Response('{}', {
			headers: { 'Access-Control-Allow-Origin': '*' }
		})
		const wrapped = withCorsOrigin(original, null)
		expect(wrapped).toBe(original)
	})

	it('preserves status and body', async () => {
		const original = new Response('{"x":1}', {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
		const wrapped = withCorsOrigin(original, 'https://hexwardens.example')
		expect(wrapped.status).toBe(404)
		expect(await wrapped.json()).toEqual({ x: 1 })
	})
})

describe('CORS response cache variation', () => {
	it('preserves existing Vary dimensions when adding Origin', () => {
		const response = withCorsOrigin(
			new Response('ok', { headers: { Vary: 'Accept-Encoding' } }),
			'https://game.example'
		)
		expect(response.headers.get('Vary')).toBe('Accept-Encoding, Origin')
	})
})
