import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import {
	deploymentOrigins,
	durableObjects,
	requiredEnv,
	originList,
	rateLimitBindings,
	stageResourceNames,
	workerCompatibility
} from './infra/bindings.ts'

export const Stack = Alchemy.Stack(
	'hexwardens',
	{ providers: Cloudflare.providers(), state: Cloudflare.state() },
	Effect.gen(function* () {
		const stage = yield* Alchemy.Stage
		const names = stageResourceNames(stage)
		const limits = rateLimitBindings(stage)
		const origins = deploymentOrigins(stage)
		const authJwtSecret = Redacted.make(requiredEnv('AUTH_JWT_SECRET'))
		const betterAuthSecret = Redacted.make(requiredEnv('BETTER_AUTH_SECRET'))
		// Preview credentials and origins never fall through to production settings.
		const trustedOrigins =
			stage === 'prod'
				? originList('BETTER_AUTH_TRUSTED_ORIGINS', origins.web)
				: origins.web
		const allowedOrigins =
			stage === 'prod' ? originList('ALLOWED_ORIGIN', origins.web) : origins.web
		const defaults = {
			compatibility: workerCompatibility,
			observability: {
				enabled: true,
				logs: { enabled: true, invocationLogs: true }
			},
			workersDev: { enabled: true, previewsEnabled: false }
		}
		// Logical IDs and production physical names stay stable across the API upgrade.
		const db = yield* Cloudflare.D1.Database('hexwardens-db', {
			name: names.database,
			migrations: { dir: './packages/db/migrations' }
		}).pipe(Alchemy.RemovalPolicy.retain(stage === 'prod'))
		const gameServer = yield* Cloudflare.Worker('hexwardens-game-server', {
			name: names.gameServer,
			main: './apps/game-server/src/index.ts',
			env: {
				GAME_RATE_LIMITER: Cloudflare.Workers.RateLimit(
					limits.game.name,
					limits.game
				),
				MATCHMAKER: Cloudflare.DurableObject(durableObjects.MATCHMAKER),
				MATCH: Cloudflare.DurableObject(durableObjects.MATCH),
				PRESENCE: Cloudflare.DurableObject(durableObjects.PRESENCE),
				DB: db,
				AUTH_JWT_SECRET: authJwtSecret,
				ALLOWED_ORIGIN: allowedOrigins
			},
			...defaults
		})
		const web = yield* Cloudflare.Website.Vite('hexwardens-web', {
			name: names.web,
			rootDir: './apps/web',
			env: {
				DB: db,
				AUTH_JWT_SECRET: authJwtSecret,
				WEB_RATE_LIMITER: Cloudflare.Workers.RateLimit(
					limits.web.name,
					limits.web
				),
				BETTER_AUTH_SECRET: betterAuthSecret,
				BETTER_AUTH_URL: origins.web,
				BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
				GAME_SERVER_URL: origins.gameServer
			},
			...defaults
		})
		return { gameServer, web, db }
	})
)
export default Stack
