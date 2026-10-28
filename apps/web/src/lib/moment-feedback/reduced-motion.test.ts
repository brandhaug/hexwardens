import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
	calloutDurationMs,
	FULL_MOTION_CALLOUT_DURATION_MS,
	prefersReducedMotion,
	REDUCED_MOTION_CALLOUT_DURATION_MS,
	subscribeReducedMotion
} from './reduced-motion'

interface FakeMediaQueryList {
	matches: boolean
	addEventListener: (
		type: 'change',
		cb: (e: { matches: boolean }) => void
	) => void
	removeEventListener: (
		type: 'change',
		cb: (e: { matches: boolean }) => void
	) => void
	dispatch(matches: boolean): void
}

function createFakeMatchMedia(initial: boolean) {
	const listeners = new Set<(e: { matches: boolean }) => void>()
	let current = initial
	const mql: FakeMediaQueryList = {
		get matches() {
			return current
		},
		set matches(value: boolean) {
			current = value
		},
		addEventListener(_type, cb) {
			listeners.add(cb)
		},
		removeEventListener(_type, cb) {
			listeners.delete(cb)
		},
		dispatch(matches) {
			current = matches
			const event = { matches }
			for (const listener of listeners) {
				listener(event)
			}
		}
	}
	return {
		matchMedia: () => mql,
		dispatch: (matches: boolean) => mql.dispatch(matches)
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('prefersReducedMotion', () => {
	it('returns false when window is unavailable', () => {
		vi.stubGlobal('window', undefined)
		expect(prefersReducedMotion()).toBe(false)
	})

	it('returns false when matchMedia is unavailable', () => {
		vi.stubGlobal('window', { matchMedia: undefined })
		expect(prefersReducedMotion()).toBe(false)
	})

	it('returns the matchMedia matches value', () => {
		const fake = createFakeMatchMedia(true)
		vi.stubGlobal('window', { matchMedia: fake.matchMedia })
		expect(prefersReducedMotion()).toBe(true)
	})
})

describe('subscribeReducedMotion', () => {
	it('notifies listeners when the preference changes', () => {
		const fake = createFakeMatchMedia(false)
		vi.stubGlobal('window', { matchMedia: fake.matchMedia })
		const listener = vi.fn<() => void>()
		const unsubscribe = subscribeReducedMotion(listener)
		fake.dispatch(true)
		expect(listener).toHaveBeenCalledWith(true)
		unsubscribe()
	})

	it('stops notifying after unsubscribe', () => {
		const fake = createFakeMatchMedia(false)
		vi.stubGlobal('window', { matchMedia: fake.matchMedia })
		const listener = vi.fn<() => void>()
		const unsubscribe = subscribeReducedMotion(listener)
		unsubscribe()
		fake.dispatch(true)
		expect(listener).not.toHaveBeenCalled()
	})

	it('returns a no-op unsubscribe when matchMedia is unavailable', () => {
		vi.stubGlobal('window', undefined)
		expect(() => subscribeReducedMotion(() => {})()).not.toThrow()
	})
})

describe('calloutDurationMs', () => {
	it('shortens callouts under reduced motion', () => {
		expect(calloutDurationMs(true)).toBe(REDUCED_MOTION_CALLOUT_DURATION_MS)
		expect(calloutDurationMs(false)).toBe(FULL_MOTION_CALLOUT_DURATION_MS)
		expect(calloutDurationMs(true)).toBeLessThan(calloutDurationMs(false))
	})
})
