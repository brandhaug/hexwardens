import { errorDiagnostics } from './error-diagnostics'

describe('error diagnostics', () => {
	it('omits arbitrary provider messages and nested payloads', () => {
		const error = Object.assign(new Error('password=secret'), {
			cause: { token: 'private' }
		})
		const summary = errorDiagnostics(error)
		expect(summary).toEqual({ name: 'Error' })
		expect(JSON.stringify(summary)).not.toMatch(/secret|private|password|token/)
	})

	it('keeps known JavaScript failure names and omits unknown values', () => {
		expect(errorDiagnostics(new TypeError('sensitive data'))).toEqual({
			name: 'TypeError'
		})
		expect(
			errorDiagnostics({ message: 'sensitive data', name: 'private' })
		).toEqual({ name: 'Error' })
	})
})
