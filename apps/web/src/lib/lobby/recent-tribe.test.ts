import { beforeEach, expect, test, vi } from 'vite-plus/test'
import { getRecentTribe, rememberTribe } from './recent-tribe'

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

test('returns null when no tribe has been remembered yet', () => {
	expect(getRecentTribe()).toBeNull()
})

test('persists the last remembered tribe and reads it back', () => {
	rememberTribe('templars')
	expect(getRecentTribe()).toBe('templars')
})

test('overwrites the previous tribe', () => {
	rememberTribe('templars')
	rememberTribe('orcs')
	expect(getRecentTribe()).toBe('orcs')
})

test('returns null for stored values that are not a valid tribe', () => {
	localStorage.setItem('hexwardens.recentTribe', 'martians')
	expect(getRecentTribe()).toBeNull()
})

test('returns null when localStorage is unavailable (SSR)', () => {
	vi.stubGlobal('localStorage', undefined)
	expect(getRecentTribe()).toBeNull()
})

test('rememberTribe is a no-op when localStorage is unavailable', () => {
	vi.stubGlobal('localStorage', undefined)
	expect(() => {
		rememberTribe('barbarians')
	}).not.toThrow()
})
