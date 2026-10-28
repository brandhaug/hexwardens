import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test'
import { delayPacer, immediatePacer } from './bot-pacer'

describe('immediatePacer', () => {
	it('resolves without delay', async () => {
		const signal = new AbortController().signal
		await expect(immediatePacer.next(signal)).resolves.toBeUndefined()
	})
})

describe('delayPacer', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('waits startMs on the first call and actionMs on subsequent calls', async () => {
		const pacer = delayPacer(500, 100)
		const signal = new AbortController().signal

		const first = pacer.next(signal)
		vi.advanceTimersByTime(499)
		let firstResolved = false
		void first.then(() => {
			firstResolved = true
			return firstResolved
		})
		await Promise.resolve()
		expect(firstResolved).toBe(false)
		vi.advanceTimersByTime(1)
		await first
		expect(firstResolved).toBe(true)

		const second = pacer.next(signal)
		vi.advanceTimersByTime(99)
		let secondResolved = false
		void second.then(() => {
			secondResolved = true
			return secondResolved
		})
		await Promise.resolve()
		expect(secondResolved).toBe(false)
		vi.advanceTimersByTime(1)
		await second
		expect(secondResolved).toBe(true)
	})

	it('rejects with signal.reason when aborted mid-wait and clears the timeout', async () => {
		const pacer = delayPacer(1000, 100)
		const controller = new AbortController()
		const reason = new Error('bye')

		const promise = pacer.next(controller.signal)
		// Register the rejection assertion before abort; it is awaited below after triggering cancellation.
		// oxlint-disable-next-line vitest/valid-expect
		const rejected = expect(promise).rejects.toBe(reason)
		vi.advanceTimersByTime(500)
		controller.abort(reason)
		await rejected

		// Advance past the original deadline — the cleared timeout must not fire.
		vi.advanceTimersByTime(1000)
	})

	it('rejects immediately if the signal is already aborted', async () => {
		const pacer = delayPacer(1000, 100)
		const controller = new AbortController()
		const reason = new Error('pre-aborted')
		controller.abort(reason)

		await expect(pacer.next(controller.signal)).rejects.toBe(reason)
	})
})
