import { withSecurityHeaders } from './response-headers'

describe('worker response security headers', () => {
	it('preserves body, status and existing CORS headers while preventing caching and sniffing', async () => {
		const response = withSecurityHeaders(
			new Response('refused', {
				status: 401,
				headers: {
					'Access-Control-Allow-Origin': 'https://game.example',
					Vary: 'Origin'
				}
			})
		)
		expect(response.status).toBe(401)
		expect(await response.text()).toBe('refused')
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://game.example'
		)
		expect(response.headers.get('Cache-Control')).toBe('private, no-store')
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
	})
})
