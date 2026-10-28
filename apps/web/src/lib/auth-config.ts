// oxlint-disable-next-line import/no-unassigned-import -- Start requires this marker to reject client imports.
import '@tanstack/react-start/server-only'
import { Config, ConfigProvider, Effect, Redacted, Schema } from 'effect'

class AuthConfigurationError extends Schema.TaggedError<AuthConfigurationError>()(
	'AuthConfigurationError',
	{ message: Schema.String }
) {}

const authConfig = Config.all({
	secret: Config.Redacted('BETTER_AUTH_SECRET'),
	baseURL: Config.NonEmptyString('BETTER_AUTH_URL'),
	origins: Config.String('BETTER_AUTH_TRUSTED_ORIGINS').pipe(
		Config.withDefault('')
	)
})

function isSecureOrigin(value: string): boolean {
	const url = URL.parse(value)
	if (url === null) {
		return false
	}
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
	return (
		(url.protocol === 'https:' || (local && url.protocol === 'http:')) &&
		url.username === '' &&
		url.password === '' &&
		url.pathname === '/' &&
		url.search === '' &&
		url.hash === '' &&
		!url.hostname.includes('*')
	)
}

export const authConfigFor = Effect.fn('Auth.readConfig')(function* (source: {
	readonly BETTER_AUTH_SECRET?: string | undefined
	readonly BETTER_AUTH_URL?: string | undefined
	readonly BETTER_AUTH_TRUSTED_ORIGINS?: string | undefined
}) {
	const config = yield* authConfig
		.parse(ConfigProvider.fromUnknown(source))
		.pipe(
			Effect.mapError(
				() =>
					new AuthConfigurationError({
						message: 'Required auth configuration is missing'
					})
			)
		)
	if (Redacted.value(config.secret).length < 32) {
		return yield* new AuthConfigurationError({
			message: 'BETTER_AUTH_SECRET must contain at least 32 characters'
		})
	}
	if (!isSecureOrigin(config.baseURL)) {
		return yield* new AuthConfigurationError({
			message: 'BETTER_AUTH_URL must be an HTTPS origin or local HTTP origin'
		})
	}
	const trustedOrigins =
		config.origins.trim() === ''
			? [new URL(config.baseURL).origin]
			: config.origins.split(',').map((origin) => origin.trim())
	if (!trustedOrigins.every(isSecureOrigin)) {
		return yield* new AuthConfigurationError({
			message:
				'BETTER_AUTH_TRUSTED_ORIGINS must contain explicit secure origins'
		})
	}
	return { secret: config.secret, baseURL: config.baseURL, trustedOrigins }
})
