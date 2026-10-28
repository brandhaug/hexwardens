import { Effect, Redacted } from 'effect'
import { authConfigFor } from './auth-config'

const valid = {
	BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
	BETTER_AUTH_URL: 'https://game.example'
}

describe('auth configuration', () => {
	it('accepts HTTPS and local HTTP while redacting the secret', async () => {
		const config = await Effect.runPromise(authConfigFor(valid))
		expect(Redacted.value(config.secret)).toBe(valid.BETTER_AUTH_SECRET)
		expect(JSON.stringify(config)).not.toContain(valid.BETTER_AUTH_SECRET)
		expect(config.trustedOrigins).toEqual(['https://game.example'])
		await expect(
			Effect.runPromise(
				authConfigFor({ ...valid, BETTER_AUTH_URL: 'http://localhost:3001' })
			)
		).resolves.toBeDefined()
	})

	it.each([
		'http://game.example',
		'https://user:secret@game.example',
		'not a url',
		'https://game.example/?secret=value'
	])(
		'rejects unsafe auth URLs without printing their contents: %s',
		async (url) => {
			const result = await Effect.runPromise(
				Effect.flip(authConfigFor({ ...valid, BETTER_AUTH_URL: url }))
			)
			expect(result.message).not.toContain(url)
		}
	)

	it.each([
		'*',
		'https://*.example',
		'http://remote.example',
		'https://user:secret@game.example',
		'null'
	])('rejects unsafe trusted origins: %s', async (origin) => {
		await expect(
			Effect.runPromise(
				Effect.flip(
					authConfigFor({ ...valid, BETTER_AUTH_TRUSTED_ORIGINS: origin })
				)
			)
		).resolves.toBeDefined()
	})

	it('rejects missing and short secrets without echoing them', async () => {
		for (const secret of [undefined, '', 'short-private-secret']) {
			const error = await Effect.runPromise(
				Effect.flip(authConfigFor({ ...valid, BETTER_AUTH_SECRET: secret }))
			)
			expect(JSON.stringify(error)).not.toContain('short-private-secret')
		}
	})
})
