const decodeToken = Schema.decodeUnknownSync(
	Schema.Struct({
		userId: Schema.String,
		username: Schema.String,
		exp: Schema.Finite
	})
)
import { Schema } from 'effect'
import { assert, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const SECRET = 'test-jwt-secret'
const envProxy = new Proxy(
	{
		DB: null,
		BETTER_AUTH_SECRET: 'better-auth-secret',
		BETTER_AUTH_URL: 'http://localhost:3001',
		AUTH_JWT_SECRET: SECRET,
		GAME_SERVER_URL: 'http://localhost:8787'
	},
	{
		get(target, prop: string) {
			envAccessLog.push(prop)
			return Object.entries(target).find(([key]) => key === prop)?.[1]
		}
	}
)
const envAccessLog: string[] = []

vi.mock('cloudflare:workers', () => ({ env: envProxy }))

vi.mock('@hexwardens/db/client', () => ({
	createDb: vi.fn<() => { __marker: string }>(() => ({ __marker: 'fake-db' }))
}))

async function verifyToken(
	token: string
): Promise<{ userId: string; username: string; exp: number }> {
	const [headerB64, payloadB64, signatureB64] = token.split('.')
	expect(headerB64).toBeDefined()
	expect(payloadB64).toBeDefined()
	expect(signatureB64).toBeDefined()
	assert(
		headerB64 !== undefined &&
			payloadB64 !== undefined &&
			signatureB64 !== undefined
	)

	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	)
	const sig = base64UrlDecode(signatureB64)
	const valid = await crypto.subtle.verify(
		'HMAC',
		key,
		sig,
		new TextEncoder().encode(`${headerB64}.${payloadB64}`)
	)
	expect(valid).toBe(true)

	const header = JSON.parse(
		new TextDecoder().decode(base64UrlDecode(headerB64))
	)
	expect(header).toEqual({ alg: 'HS256', typ: 'JWT' })

	return decodeToken(
		JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))
	)
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
	const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
	const binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

describe('createServerContext', () => {
	beforeEach(() => {
		envAccessLog.length = 0
		vi.clearAllMocks()
	})

	it('does not touch env until an accessor is called', async () => {
		const { createServerContext } = await import('./server-context')
		const { createDb } = await import('@hexwardens/db/client')

		createServerContext(new Request('http://localhost/'))

		expect(envAccessLog).toEqual([])
		expect(createDb).not.toHaveBeenCalled()
	})

	it('mints a valid guest HS256 token', async () => {
		const { createServerContext } = await import('./server-context')
		const ctx = createServerContext(new Request('http://localhost/'))

		const token = await ctx.mintGuestToken()
		const payload = await verifyToken(token)

		expect(payload.userId).toMatch(/^guest_/)
		expect(payload.username).toMatch(/^Guest #\d{4}$/)
		expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
	})

	it('mints a valid user HS256 token', async () => {
		const { createServerContext } = await import('./server-context')
		const ctx = createServerContext(new Request('http://localhost/'))

		const token = await ctx.mintUserToken('u-1', 'alice')
		const payload = await verifyToken(token)

		expect(payload.userId).toBe('u-1')
		expect(payload.username).toBe('alice')
	})

	it('memoises db() within a request', async () => {
		const { createDb } = await import('@hexwardens/db/client')

		const { createServerContext } = await import('./server-context')
		const ctx = createServerContext(new Request('http://localhost/'))

		expect(ctx.db()).toBe(ctx.db())

		expect(createDb).toHaveBeenCalledTimes(1)
	})

	it('does not leak state across contexts', async () => {
		const { createDb } = await import('@hexwardens/db/client')

		const { createServerContext } = await import('./server-context')
		const a = createServerContext(new Request('http://localhost/a'))
		const b = createServerContext(new Request('http://localhost/b'))

		a.db()
		b.db()

		expect(createDb).toHaveBeenCalledTimes(2)
	})

	it('exposes the original request', async () => {
		const { createServerContext } = await import('./server-context')
		const request = new Request('http://localhost/x')
		const ctx = createServerContext(request)
		expect(ctx.request).toBe(request)
	})
})
