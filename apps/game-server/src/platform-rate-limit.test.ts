import { checkPlatformRateLimit } from './platform-rate-limit'

const remote = new Request('https://game.example/api/auth/sign-in/email', {
	headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': 'spoofed' }
})

describe('platform rate limit boundary', () => {
	it('fails closed on missing remote bindings but permits local development', async () => {
		const remoteResponse = await checkPlatformRateLimit(remote, undefined)
		expect(remoteResponse?.status).toBe(503)
		const mismatchedConfig = await checkPlatformRateLimit(
			new Request('http://localhost:3001/'),
			undefined,
			'https://game.example'
		)
		expect(mismatchedConfig?.status).toBe(503)
		expect(
			await checkPlatformRateLimit(
				new Request('http://localhost:3001/'),
				undefined,
				'http://localhost:3001'
			)
		).toBeNull()
	})

	it('fails closed when the binding throws', async () => {
		const binding = {
			limit: () => Promise.reject(new Error('private provider failure'))
		}
		const response = await checkPlatformRateLimit(remote, binding)
		expect(response?.status).toBe(503)
		expect(await response?.text()).not.toContain('private')
	})

	it('uses only platform identity and reports a denial with a retry window', async () => {
		const keys: string[] = []
		const response = await checkPlatformRateLimit(remote, {
			limit: ({ key }) => {
				keys.push(key)
				return Promise.resolve({ success: false })
			}
		})
		expect(keys).toEqual(['192.0.2.1'])
		expect(response?.status).toBe(429)
		expect(response?.headers.get('Retry-After')).toBe('60')
	})

	it('allows a positive decision and shares unidentified callers', async () => {
		const keys: string[] = []
		const response = await checkPlatformRateLimit(
			new Request('https://game.example/', {
				headers: { 'X-Forwarded-For': 'spoofed', 'True-Client-IP': 'spoofed' }
			}),
			{
				limit: ({ key }) => {
					keys.push(key)
					return Promise.resolve({ success: true })
				}
			}
		)
		expect(keys).toEqual(['unknown'])
		expect(response).toBeNull()
	})
})
