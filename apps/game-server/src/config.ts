import { Config, ConfigProvider, Effect, Redacted } from 'effect'
import { parseAllowedOrigins, type CorsPolicy } from './cors'
import { type Env } from './types'

/**
 * Validated runtime configuration. An empty or missing `AUTH_JWT_SECRET` /
 * `ALLOWED_ORIGIN` is a deploy-time mistake — loading fails immediately with
 * a descriptive `ConfigError` instead of surfacing later as a 401 on the
 * first WebSocket upgrade. The secret is `Redacted` so it can never leak
 * through logs or error messages.
 */
export type EnvConfig = {
	readonly authJwtSecret: Redacted.Redacted
	readonly corsPolicy: CorsPolicy
}

/**
 * The raw string vars config reads — any `Env` satisfies this structurally.
 * `Partial` because the whole point is validating an env that may be missing
 * them.
 */
export type RawEnv = Partial<Pick<Env, 'AUTH_JWT_SECRET' | 'ALLOWED_ORIGIN'>>

const envConfig = Config.all({
	authJwtSecret: Config.NonEmptyString('AUTH_JWT_SECRET').pipe(
		Config.map(Redacted.make)
	),
	corsPolicy: Config.NonEmptyString('ALLOWED_ORIGIN').pipe(
		Config.map(parseAllowedOrigins)
	)
})

/** Effect-typed variant for callers already inside an Effect program. */
export const envConfigFor = (env: RawEnv) =>
	envConfig.parse(ConfigProvider.fromUnknown(env))

const cache = new WeakMap<RawEnv, EnvConfig>()

/**
 * Loads (and caches per isolate) the validated config. Throws on
 * misconfiguration — callers are construction-time edges (Worker fetch,
 * Durable Object constructors) where failing loudly is the point.
 */
export function loadEnvConfig(env: RawEnv): EnvConfig {
	const cached = cache.get(env)
	if (cached !== undefined) {
		return cached
	}
	const config = Effect.runSync(envConfigFor(env))
	cache.set(env, config)
	return config
}
