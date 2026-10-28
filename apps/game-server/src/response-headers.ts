/** Keep native WebSocket upgrade responses intact, including their socket handle. */
export function withSecurityHeaders(response: Response): Response {
	if (response.status === 101) {
		return response
	}
	const headers = new Headers(response.headers)
	headers.set('Cache-Control', 'private, no-store')
	headers.set('X-Content-Type-Options', 'nosniff')
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	})
}
