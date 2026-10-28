import { beforeEach, vi } from 'vite-plus/test'

import {
	getOnboardingProgress,
	isOnboardingCompleted,
	ONBOARDING_STORAGE_KEY,
	ONBOARDING_VERSION,
	resetOnboardingProgress,
	setOnboardingCompleted,
	subscribeOnboardingProgress
} from './onboarding-progress'

function createLocalStorageStub() {
	const store = new Map<string, string>()
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value)
		},
		removeItem: (key: string) => {
			store.delete(key)
		},
		clear: () => {
			store.clear()
		},
		key: (index: number) => [...store.keys()][index] ?? null,
		get length() {
			return store.size
		}
	}
}

beforeEach(() => {
	vi.stubGlobal('localStorage', createLocalStorageStub())
})

test('returns not-completed defaults when nothing is stored', () => {
	expect(getOnboardingProgress()).toEqual({
		version: ONBOARDING_VERSION,
		completed: false
	})
})

test('persists completion under versioned onboarding key', () => {
	setOnboardingCompleted(true)
	const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
	if (raw === null) {
		throw new Error('expected onboarding progress to be set')
	}
	expect(JSON.parse(raw)).toEqual({
		version: ONBOARDING_VERSION,
		completed: true
	})
})

test('isOnboardingCompleted reflects the last setOnboardingCompleted call', () => {
	expect(isOnboardingCompleted()).toBe(false)
	setOnboardingCompleted(true)
	expect(isOnboardingCompleted()).toBe(true)
})

test('completion from a previous session survives a reload', () => {
	localStorage.setItem(
		ONBOARDING_STORAGE_KEY,
		JSON.stringify({ version: ONBOARDING_VERSION, completed: true })
	)
	expect(isOnboardingCompleted()).toBe(true)
})

test('completion stored under an older version is treated as not-completed', () => {
	localStorage.setItem(
		ONBOARDING_STORAGE_KEY,
		JSON.stringify({ version: ONBOARDING_VERSION - 1, completed: true })
	)
	expect(isOnboardingCompleted()).toBe(false)
})

test('falls back to defaults on corrupt JSON', () => {
	localStorage.setItem(ONBOARDING_STORAGE_KEY, '}{corrupt')
	expect(getOnboardingProgress()).toEqual({
		version: ONBOARDING_VERSION,
		completed: false
	})
})

test('falls back to defaults when stored value has the wrong shape', () => {
	localStorage.setItem(
		ONBOARDING_STORAGE_KEY,
		JSON.stringify({ done: 'maybe' })
	)
	expect(getOnboardingProgress()).toEqual({
		version: ONBOARDING_VERSION,
		completed: false
	})
})

test('reset clears stored progress and notifies subscribers', () => {
	setOnboardingCompleted(true)
	const listener = vi.fn<() => void>()
	const unsubscribe = subscribeOnboardingProgress(listener)
	resetOnboardingProgress()
	expect(isOnboardingCompleted()).toBe(false)
	expect(listener).toHaveBeenCalledWith({
		version: ONBOARDING_VERSION,
		completed: false
	})
	unsubscribe()
})

test('subscribe fires after setOnboardingCompleted', () => {
	const listener = vi.fn<() => void>()
	const unsubscribe = subscribeOnboardingProgress(listener)
	setOnboardingCompleted(true)
	expect(listener).toHaveBeenCalledWith({
		version: ONBOARDING_VERSION,
		completed: true
	})
	unsubscribe()
})

test('unsubscribe stops further notifications', () => {
	const listener = vi.fn<() => void>()
	const unsubscribe = subscribeOnboardingProgress(listener)
	unsubscribe()
	setOnboardingCompleted(true)
	expect(listener).not.toHaveBeenCalled()
})

test('returns the same reference between reads when nothing changed', () => {
	const first = getOnboardingProgress()
	const second = getOnboardingProgress()
	expect(second).toBe(first)
})

test('returns a new reference after the value changes', () => {
	const before = getOnboardingProgress()
	setOnboardingCompleted(true)
	const after = getOnboardingProgress()
	expect(after).not.toBe(before)
	expect(after.completed).toBe(true)
})
