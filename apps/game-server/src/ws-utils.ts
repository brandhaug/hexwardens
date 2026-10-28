import { type Schema } from 'effect'
/**
 * JSON response helpers used by the Durable Objects. CORS headers are added
 * once at the worker edge by `withCorsOrigin` — DOs intentionally emit no
 * `Access-Control-Allow-Origin` header to keep the gate as the single source
 * of truth.
 */
export function jsonResponse(data: Schema.Json, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	})
}

export function jsonError(message: string, status: number): Response {
	return jsonResponse({ error: message }, status)
}
