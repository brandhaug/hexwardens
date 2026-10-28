import { it } from '@effect/vitest'
import { Effect, Redacted } from 'effect'
import { envConfigFor, loadEnvConfig, type RawEnv } from './config'

/** Only the string vars matter for config; bindings are irrelevant here. */
function envWith(vars: RawEnv): RawEnv {
	return { ...vars }
}

describe('envConfigFor', () => {
	it.effect('parses a complete env into typed config', () =>
		Effect.gen(function* () {
			const config = yield* envConfigFor(
				envWith({
					AUTH_JWT_SECRET: 'a-real-secret',
					ALLOWED_ORIGIN: 'https://hexwardens.com, https://www.hexwardens.com'
				})
			)
			expect(Redacted.value(config.authJwtSecret)).toBe('a-real-secret')
			expect(config.corsPolicy).toEqual({
				kind: 'allowlist',
				origins: ['https://hexwardens.com', 'https://www.hexwardens.com']
			})
		})
	)

	it.effect('treats a wildcard ALLOWED_ORIGIN as the wildcard policy', () =>
		Effect.gen(function* () {
			const config = yield* envConfigFor(
				envWith({ AUTH_JWT_SECRET: 'a-real-secret', ALLOWED_ORIGIN: '*' })
			)
			expect(config.corsPolicy).toEqual({ kind: 'wildcard' })
		})
	)

	it.effect('fails on an empty AUTH_JWT_SECRET', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				envConfigFor(envWith({ AUTH_JWT_SECRET: '', ALLOWED_ORIGIN: '*' }))
			)
			// oxlint-disable-next-line hexwardens/no-unknown-error-message -- Assert the known Config error identifies the missing key; no production logging occurs.
			expect(String(error)).toContain('AUTH_JWT_SECRET')
		})
	)

	it.effect('fails on a missing ALLOWED_ORIGIN', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				envConfigFor(envWith({ AUTH_JWT_SECRET: 'a-real-secret' }))
			)
			// oxlint-disable-next-line hexwardens/no-unknown-error-message -- Assert the known Config error identifies the missing key; no production logging occurs.
			expect(String(error)).toContain('ALLOWED_ORIGIN')
		})
	)

	it('never prints the secret when the config is logged', () => {
		const config = loadEnvConfig(
			envWith({ AUTH_JWT_SECRET: 'super-secret', ALLOWED_ORIGIN: '*' })
		)
		expect(JSON.stringify(config)).not.toContain('super-secret')
	})

	it('caches per env object', () => {
		const env = envWith({ AUTH_JWT_SECRET: 'cached', ALLOWED_ORIGIN: '*' })
		expect(loadEnvConfig(env)).toBe(loadEnvConfig(env))
	})
})
