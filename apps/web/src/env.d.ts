declare namespace Cloudflare {
	interface Env {
		WEB_RATE_LIMITER?: import('./lib/platform-rate-limit').PlatformRateLimiter
		DB: D1Database
		BETTER_AUTH_SECRET: string
		BETTER_AUTH_URL: string
		BETTER_AUTH_TRUSTED_ORIGINS?: string | undefined
		AUTH_JWT_SECRET: string
		GAME_SERVER_URL: string
	}
}
