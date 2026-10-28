// oxlint-disable-next-line import/no-unassigned-import -- Start requires this marker to reject client imports.
import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
export type ServerRateLimitResult =
	| { kind: 'ok' }
	| { kind: 'limited'; retryAfterSeconds: number }

type ServerRateLimitRule = {
	readonly windowMs: number
	readonly maxRequests: number
}

type ServerRateBucket = {
	windowStart: number
	windowMs: number
	count: number
}

const buckets = new Map<string, ServerRateBucket>()
let lastCleanup = 0
const cleanupIntervalMs = 60_000

export function checkServerRateLimit(
	request: Request,
	scope: string,
	rule: ServerRateLimitRule,
	now: number = Date.now()
): ServerRateLimitResult {
	if (isRateLimitDisabled(request)) {
		return { kind: 'ok' }
	}
	cleanupExpiredBuckets(now)
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

function clientAddress(request: Request): string {
	// Cloudflare overwrites this header. Forwarded headers can be supplied by
	// callers, so absent platform identity must share a bucket, not bypass it.
	return request.headers.get('CF-Connecting-IP') || 'unknown'
}

// nodejs_compat can expose process.env in deployed Workers too. Require a
// loopback request and exclusively local provider configuration before bypassing.
function isRateLimitDisabled(request: Request): boolean {
	const origins = [
		env.BETTER_AUTH_URL,
		...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(',').filter(Boolean)
	]
	return (
		process.env.HEXWARDENS_DISABLE_RATE_LIMIT === '1' &&
		isLocalOrigin(request.url) &&
		origins.every(isLocalOrigin)
	)
}

function isLocalOrigin(value: string): boolean {
	const url = URL.parse(value)
	return (
		url !== null && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
	)
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
