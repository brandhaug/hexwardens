import { createWsMessageGate } from './ws-message-gate'

describe('createWsMessageGate', () => {
	const socket = {}
	const otherSocket = {}

	it('accepts messages under the size and rate budgets', () => {
		const gate = createWsMessageGate({ maxMessages: 5, windowMs: 1000 })
		for (let i = 0; i < 5; i++) {
			expect(gate.check(socket, 'hello', 0).kind).toBe('ok')
		}
	})

	it('rejects oversized messages without touching the rate budget', () => {
		const gate = createWsMessageGate({ maxChars: 10, maxMessages: 1 })
		expect(gate.check(socket, 'x'.repeat(11), 0).kind).toBe('too-large')
		expect(gate.check(socket, 'ok', 0).kind).toBe('ok')
	})

	it('rate-limits past the window budget and flags the first overage once', () => {
		const gate = createWsMessageGate({ maxMessages: 2, windowMs: 1000 })
		gate.check(socket, 'a', 0)
		gate.check(socket, 'b', 0)
		const first = gate.check(socket, 'c', 0)
		assert(first.kind === 'rate-limited')
		expect(first.firstOverage).toBe(true)
		const second = gate.check(socket, 'd', 0)
		assert(second.kind === 'rate-limited')
		expect(second.firstOverage).toBe(false)
	})

	it('resets the budget when the window elapses', () => {
		const gate = createWsMessageGate({ maxMessages: 1, windowMs: 1000 })
		expect(gate.check(socket, 'a', 0).kind).toBe('ok')
		expect(gate.check(socket, 'b', 500).kind).toBe('rate-limited')
		expect(gate.check(socket, 'c', 1000).kind).toBe('ok')
	})

	it('escalates to abusive at 5x the window budget', () => {
		const gate = createWsMessageGate({ maxMessages: 2, windowMs: 1000 })
		let lastKind = ''
		for (let i = 0; i < 11; i++) {
			lastKind = gate.check(socket, 'spam', 0).kind
		}
		expect(lastKind).toBe('abusive')
	})

	it('tracks budgets per socket', () => {
		const gate = createWsMessageGate({ maxMessages: 1, windowMs: 1000 })
		expect(gate.check(socket, 'a', 0).kind).toBe('ok')
		expect(gate.check(socket, 'b', 0).kind).toBe('rate-limited')
		expect(gate.check(otherSocket, 'a', 0).kind).toBe('ok')
	})
})
