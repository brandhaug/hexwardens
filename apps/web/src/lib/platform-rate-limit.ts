import { Effect, Result } from 'effect'
/** Structural subset of Cloudflare's native rate limiting binding. */
export type PlatformRateLimiter = {
	readonly limit: (input: {
		readonly key: string
	}) => Promise<{ readonly success: boolean }>
}

/** Public hosts fail closed. Local development keeps its scoped memory limits. */
export async function checkPlatformRateLimit(
	request: Request,
	binding: PlatformRateLimiter | undefined,
	configuredOrigins = ''
): Promise<Response | null> {
	if (binding === undefined) {
		const localConfig = configuredOrigins
			.split(',')
			.every((origin) => origin.trim() === '*' || isLocalOrigin(origin.trim()))
		if (localConfig && isLocalOrigin(request.url)) {
			return null
		}
		return unavailable()
	}
	const outcome = await Effect.runPromise(
		Effect.tryPromise(() =>
			binding.limit({
				key: request.headers.get('CF-Connecting-IP') || 'unknown'
			})
		).pipe(Effect.result)
	)
	if (Result.isFailure(outcome)) {
		return unavailable()
	}
	const decision = outcome.success
	if (decision.success) {
		return null
	}
	return Response.json(
		{ error: 'Too many requests' },
		{
			status: 429,
			headers: { 'Retry-After': '60', 'Cache-Control': 'private, no-store' }
		}
	)
}

function unavailable(): Response {
	return Response.json(
		{ error: 'Request protection unavailable' },
		{
			status: 503,
			headers: { 'Retry-After': '60', 'Cache-Control': 'private, no-store' }
		}
	)
}

function isLocalOrigin(value: string): boolean {
	const url = URL.parse(value)
	return (
		url !== null && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
	)
}
