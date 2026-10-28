import { authFormRequest, authFailureMessage } from './auth-form-request'

describe('auth form HTTP boundary', () => {
	it('preserves origin, IP and cookies while replacing form content headers', async () => {
		const request = new Request('https://game.example/_serverFn/sign-in', {
			method: 'POST',
			headers: {
				origin: 'https://game.example',
				'cf-connecting-ip': '192.0.2.1',
				cookie: 'session=opaque',
				'content-type': 'multipart/form-data',
				'content-length': '999'
			}
		})
		const forwarded = authFormRequest(request, '/sign-in/username', {
			username: 'alice',
			password: 'password'
		})
		expect(forwarded.url).toBe('https://game.example/api/auth/sign-in/username')
		expect(forwarded.method).toBe('POST')
		expect(forwarded.headers.get('origin')).toBe('https://game.example')
		expect(forwarded.headers.get('cf-connecting-ip')).toBe('192.0.2.1')
		expect(forwarded.headers.get('cookie')).toBe('session=opaque')
		expect(forwarded.headers.get('content-type')).toBe('application/json')
		expect(forwarded.headers.has('content-length')).toBe(false)
		expect(await forwarded.json()).toEqual({
			username: 'alice',
			password: 'password'
		})
	})

	it('never reflects provider messages or unknown response fields', () => {
		expect(
			authFailureMessage(
				Response.json(
					{ message: 'database password=secret', code: 'UNKNOWN' },
					{ status: 500 }
				),
				'Sign in failed'
			)
		).toBe('Sign in failed')
		expect(
			authFailureMessage(
				Response.json({ message: 'secret' }, { status: 429 }),
				'Sign in failed'
			)
		).toBe('Too many attempts. Please try again later.')
	})
})
