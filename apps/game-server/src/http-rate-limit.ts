import { isLocalRateLimitRequest } from './platform-rate-limit'
export type HttpRateLimitResult =
	| { kind: 'ok' }
	| { kind: 'limited'; retryAfterSeconds: number }

type RateLimitRule = {
	readonly windowMs: number
	readonly maxRequests: number
}

type RateBucket = {
	windowStart: number
	windowMs: number
	count: number
}

const buckets = new Map<string, RateBucket>()
const cleanupIntervalMs = 60_000
let lastCleanup = 0

const lobbyMutationRule: RateLimitRule = {
	windowMs: 60_000,
	maxRequests: 30
}

const websocketUpgradeRule: RateLimitRule = {
	windowMs: 60_000,
	maxRequests: 90
}

const publicQueueRule: RateLimitRule = {
	windowMs: 60_000,
	maxRequests: 20
}

export type HttpRateLimitScope =
	| 'lobby_create'
	| 'lobby_join'
	| 'public_queue'
	| 'lobby_ws'
	| 'match_ws'

export function rateLimitScopeForRequest(
	request: Request,
	url: URL,
	disableFlag?: string,
	configuredOrigins = ''
): HttpRateLimitScope | null {
	if (
		disableFlag === '1' &&
		isLocalRateLimitRequest(request, configuredOrigins)
	) {
		return null
	}
	if (url.pathname === '/lobby/create' && request.method === 'POST') {
		return 'lobby_create'
	}
	if (url.pathname === '/lobby/join' && request.method === 'POST') {
		return 'lobby_join'
	}
	if (url.pathname === '/lobby/public-queue' && request.method === 'POST') {
		return 'public_queue'
	}
	if (
		url.pathname.startsWith('/lobby/') &&
		request.headers.get('Upgrade') === 'websocket'
	) {
		return 'lobby_ws'
	}
	if (
		url.pathname.startsWith('/match/') &&
		request.headers.get('Upgrade') === 'websocket'
	) {
		return 'match_ws'
	}
	return null
}

export function checkHttpRateLimit(
	request: Request,
	scope: HttpRateLimitScope,
	now: number = Date.now()
): HttpRateLimitResult {
	cleanupExpiredBuckets(now)
	const rule = ruleForScope(scope)
	const key = `${scope}:${clientAddress(request)}`
	const existing = buckets.get(key)
	if (!existing || now - existing.windowStart >= rule.windowMs) {
		buckets.set(key, { windowStart: now, windowMs: rule.windowMs, count: 1 })
		return { kind: 'ok' }
	}
	existing.count++
	if (existing.count <= rule.maxRequests) {
		return { kind: 'ok' }
	}
	return {
		kind: 'limited',
		retryAfterSeconds: Math.max(
			1,
			Math.ceil((existing.windowStart + rule.windowMs - now) / 1000)
		)
	}
}

function ruleForScope(scope: HttpRateLimitScope): RateLimitRule {
	const rules = {
		public_queue: publicQueueRule,
		lobby_ws: websocketUpgradeRule,
		match_ws: websocketUpgradeRule,
		lobby_create: lobbyMutationRule,
		lobby_join: lobbyMutationRule
	}
	return rules[scope]
}

function clientAddress(request: Request): string {
	// Cloudflare overwrites this header. Forwarded headers can be supplied by
	// callers, so absent platform identity must share a bucket, not bypass it.
	return request.headers.get('CF-Connecting-IP') || 'unknown'
}

// A bucket whose own window has fully elapsed is inert (the next check
// resets it), so expiry must key off the bucket's windowMs — a fixed TTL
// would wipe still-active buckets for any rule with a longer window.
function cleanupExpiredBuckets(now: number) {
	if (now - lastCleanup < cleanupIntervalMs) {
		return
	}
	lastCleanup = now
	for (const [key, bucket] of buckets) {
		if (now - bucket.windowStart >= bucket.windowMs) {
			buckets.delete(key)
		}
	}
}
