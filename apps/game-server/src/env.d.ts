declare namespace Cloudflare {
	interface Env {
		DB: D1Database
		AUTH_JWT_SECRET: string
		ALLOWED_ORIGIN: string
		MATCHMAKER: DurableObjectNamespace
		MATCH: DurableObjectNamespace
	}
}
