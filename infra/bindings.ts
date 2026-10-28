// Deployment and generated local Wrangler configuration share these values.
export const workerCompatibility = {
	date: '2026-09-26',
	flags: ['nodejs_compat', 'global_fetch_strictly_public']
}
export const localDatabaseId = 'placeholder'
export const localPersistDirectory = '.wrangler-dev/state'
export const durableObjects = {
	MATCHMAKER: 'Matchmaker',
	MATCH: 'Match',
	PRESENCE: 'Presence'
}
export const durableObjectMigrations = [
	{
		tag: 'v1',
		new_sqlite_classes: [durableObjects.MATCHMAKER, durableObjects.MATCH]
	},
	{ tag: 'v2', new_sqlite_classes: [durableObjects.PRESENCE] }
]

export function validateStage(stage: string): string {
	if (stage !== 'prod' && !/^pr-[1-9][0-9]{0,9}$/.test(stage)) {
		throw new Error('Stage must be prod or pr-<positive pull request number>')
	}
	return stage
}

export function stageResourceNames(stage: string) {
	validateStage(stage)
	const prefix = stage === 'prod' ? 'hexwardens' : `hexwardens-${stage}`
	return {
		database: `${prefix}-db`,
		web: `${prefix}-web`,
		gameServer: `${prefix}-game-server`
	}
}

export function validateOrigin(value: string): string {
	const url = new URL(value)
	if (
		url.protocol !== 'https:' ||
		url.origin !== value ||
		value.includes('*') ||
		url.username ||
		url.password
	) {
		throw new Error(
			'Deployment URLs must be exact HTTPS origins without credentials, paths or wildcards'
		)
	}
	return value
}

export function requiredEnv(name: string): string {
	const value = process.env[name]
	if (!value?.trim()) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

export function deploymentOrigins(stage: string) {
	const names = stageResourceNames(stage)
	if (
		stage === 'prod' &&
		process.env.BETTER_AUTH_URL &&
		process.env.GAME_SERVER_URL
	) {
		return {
			web: validateOrigin(process.env.BETTER_AUTH_URL),
			gameServer: validateOrigin(process.env.GAME_SERVER_URL)
		}
	}
	const subdomain = requiredEnv('CLOUDFLARE_WORKERS_SUBDOMAIN')
	if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
		throw new Error('Invalid workers.dev subdomain')
	}
	return {
		web: validateOrigin(
			stage === 'prod' && process.env.BETTER_AUTH_URL
				? process.env.BETTER_AUTH_URL
				: `https://${names.web}.${subdomain}.workers.dev`
		),
		gameServer: validateOrigin(
			stage === 'prod' && process.env.GAME_SERVER_URL
				? process.env.GAME_SERVER_URL
				: `https://${names.gameServer}.${subdomain}.workers.dev`
		)
	}
}

type RateLimitSpec = {
	name: string
	namespaceId: string
	simple: { limit: number; period: 10 | 60 }
}
type StageRateLimits = {
	web: RateLimitSpec
	game: RateLimitSpec
}
export function rateLimitBindings(stage: string): StageRateLimits {
	validateStage(stage)
	const namespace =
		stage === 'prod' ? 1000 : 1_000_000 + Number(stage.slice(3)) * 10
	return {
		web: {
			name: 'WEB_RATE_LIMITER',
			namespaceId: String(namespace + 1),
			simple: { limit: 60, period: 60 }
		},
		game: {
			name: 'GAME_RATE_LIMITER',
			namespaceId: String(namespace + 2),
			simple: { limit: 120, period: 60 }
		}
	}
}

export function originList(name: string, fallback: string): string {
	return (process.env[name] || fallback)
		.split(',')
		.map((origin) => validateOrigin(origin.trim()))
		.join(',')
}
