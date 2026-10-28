/** Preserve request identity when a server function delegates to Better Auth. */
export function authFormRequest(
	request: Request,
	path: '/sign-in/username' | '/sign-up/email',
	body: Record<string, string>
): Request {
	const headers = new Headers(request.headers)
	headers.delete('content-length')
	headers.set('content-type', 'application/json')
	return new Request(new URL(`/api/auth${path}`, request.url), {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	})
}

/** Provider error text can contain SQL, credentials or submitted user data. */
export function authFailureMessage(
	response: Response,
	fallback: string
): string {
	return response.status === 429
		? 'Too many attempts. Please try again later.'
		: fallback
}
