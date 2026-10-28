import { describe, expect, it, vi } from 'vite-plus/test'
import { type ServerContext } from '@/lib/server-context-tag'

vi.mock('cloudflare:workers', () => ({ env: {} }))

function fakeContext(): ServerContext & {
	calls: Array<
		{ kind: 'user'; userId: string; username: string } | { kind: 'guest' }
	>
} {
	const calls: Array<
		{ kind: 'user'; userId: string; username: string } | { kind: 'guest' }
	> = []
	return {
		calls,
		request: new Request('http://localhost/'),
		db() {
			throw new Error('db not needed in this test')
		},
		mintUserToken(userId, username) {
			calls.push({ kind: 'user', userId, username })
			return Promise.resolve('user-token')
		},
		mintGuestToken() {
			calls.push({ kind: 'guest' })
			return Promise.resolve('guest-token')
		}
	}
}

const baseUser = {
	id: 'u-1',
	email: 'alice@example.com',
	emailVerified: true,
	name: 'Alice',
	createdAt: new Date(),
	updatedAt: new Date(),
	image: null,
	username: 'alice',
	displayUsername: 'alice'
}

const baseSession = {
	id: 's-1',
	createdAt: new Date(),
	updatedAt: new Date(),
	userId: 'u-1',
	expiresAt: new Date(Date.now() + 60_000),
	token: 't-1',
	ipAddress: null,
	userAgent: null
}

describe('mintTokenForSession', () => {
	it('mints a guest token when there is no session', async () => {
		const { mintTokenForSession } = await import('./auth.server')
		const ctx = fakeContext()

		const token = await mintTokenForSession(ctx, null)

		expect(token).toBe('guest-token')
		expect(ctx.calls).toEqual([{ kind: 'guest' }])
	})

	it('mints a user token from the session username', async () => {
		const { mintTokenForSession } = await import('./auth.server')
		const ctx = fakeContext()

		const token = await mintTokenForSession(ctx, {
			session: baseSession,
			user: baseUser
		})

		expect(token).toBe('user-token')
		expect(ctx.calls).toEqual([
			{ kind: 'user', userId: 'u-1', username: 'alice' }
		])
	})

	it('falls back to user.name when username is missing', async () => {
		const { mintTokenForSession } = await import('./auth.server')
		const ctx = fakeContext()

		await mintTokenForSession(ctx, {
			session: baseSession,
			user: { ...baseUser, id: 'u-2', username: null, displayUsername: null }
		})

		expect(ctx.calls).toEqual([
			{ kind: 'user', userId: 'u-2', username: 'Alice' }
		])
	})
})
