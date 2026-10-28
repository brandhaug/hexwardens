/**
 * CORS policy derived from the `ALLOWED_ORIGIN` env var.
 *
 * - `wildcard` ("*") permits any origin and replies with `Access-Control-Allow-Origin: *`.
 *   Use only for local development; production should always use an explicit allowlist.
 * - `allowlist` carries a normalized list of exact-match origins. An empty list
 *   denies everything — the safe default if `ALLOWED_ORIGIN` is missing.
 */
export type CorsPolicy =
	| { kind: 'wildcard' }
	| { kind: 'allowlist'; origins: ReadonlyArray<string> }

export function parseAllowedOrigins(raw: string | undefined): CorsPolicy {
	if (raw === '*') {
		return { kind: 'wildcard' }
	}
	if (!raw) {
		return { kind: 'allowlist', origins: [] }
	}

	const origins = raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)

	return { kind: 'allowlist', origins }
}

export function isOriginAllowed(
	policy: CorsPolicy,
	origin: string | null
): boolean {
	if (policy.kind === 'wildcard') {
		return true
	}
	if (origin === null) {
		return false
	}
	return policy.origins.includes(origin)
}

/**
 * Resolves the value to send back as `Access-Control-Allow-Origin`.
 * Returns `null` when the origin is rejected — the caller should respond 403
 * (or omit the header on non-CORS responses).
 */
export function resolveCorsOrigin(
	policy: CorsPolicy,
	origin: string | null
): string | null {
	if (policy.kind === 'wildcard') {
		return '*'
	}
	if (origin === null) {
		return null
	}
	return policy.origins.includes(origin) ? origin : null
}

function corsHeaders(origin: string) {
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers':
			'Content-Type, Authorization, traceparent, tracestate, b3',
		// `Vary: Origin` instructs caches that the response varies by origin so
		// allowlist entries don't get cross-served between different callers.
		Vary: 'Origin'
	}
}

/**
 * Returns a clone of `response` with `Access-Control-Allow-Origin` (and
 * `Vary: Origin`) set to `corsOrigin`. WebSocket upgrade responses (status
 * 101) and same-origin responses (no `corsOrigin`) are returned untouched.
 * This lets the worker entry overlay the correct CORS value onto Durable
 * Object responses without the DOs having to know the policy themselves.
 */
export function withCorsOrigin(
	response: Response,
	corsOrigin: string | null
): Response {
	if (corsOrigin === null) {
		return response
	}
	if (response.status === 101) {
		return response
	}
	const headers = new Headers(response.headers)
	headers.set('Access-Control-Allow-Origin', corsOrigin)
	headers.append('Vary', 'Origin')
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	})
}

/**
 * CORS gate result for the worker entry — and any Durable Object that accepts
 * a WebSocket upgrade. Callers should:
 *
 * - return `response` directly when present (preflight reply or 403 reject),
 * - or fall through to normal routing when `response === null`, applying
 *   `corsOrigin` to any CORS-bearing JSON response.
 *
 * Cross-origin requests (browser sends `Origin`) must clear the policy gate.
 * Same-origin / non-browser callers (no `Origin` header) bypass CORS — the
 * browser security model does not apply.
 */
export type CorsGateResult = {
	response: Response | null
	corsOrigin: string | null
}

export function applyCorsGate(
	request: Request,
	policy: CorsPolicy
): CorsGateResult {
	const requestOrigin = request.headers.get('Origin')
	const corsOrigin = resolveCorsOrigin(policy, requestOrigin)

	if (request.method === 'OPTIONS') {
		if (corsOrigin === null) {
			return { response: new Response(null, { status: 403 }), corsOrigin: null }
		}
		return {
			response: new Response(null, {
				status: 204,
				headers: corsHeaders(corsOrigin)
			}),
			corsOrigin
		}
	}

	if (requestOrigin !== null && corsOrigin === null) {
		return { response: new Response(null, { status: 403 }), corsOrigin: null }
	}

	return { response: null, corsOrigin }
}
