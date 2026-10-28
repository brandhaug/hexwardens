import { beforeEach, vi } from 'vite-plus/test'

import {
	AUDIO_PREFERENCES_STORAGE_KEY,
	getAudioPreferences,
	setAudioPreferences,
	setFxVolume,
	setMasterVolume,
	setMusicVolume,
	subscribeAudioPreferences,
	toggleFxMute,
	toggleMusicMute,
	toggleMute
} from './audio-preferences'

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

const DEFAULTS = {
	muted: false,
	musicMuted: false,
	fxMuted: false,
	masterVolume: 0.7,
	musicVolume: 0.55,
	fxVolume: 0.85
}

beforeEach(() => {
	vi.stubGlobal('localStorage', createLocalStorageStub())
})

test('returns default preferences when nothing is stored', () => {
	expect(getAudioPreferences()).toEqual(DEFAULTS)
})

test('get reflects the last value written by set', () => {
	setAudioPreferences({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.25,
		musicVolume: 0.4,
		fxVolume: 0.6
	})
	expect(getAudioPreferences()).toEqual({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.25,
		musicVolume: 0.4,
		fxVolume: 0.6
	})
})

test('persists under the versioned audio key as JSON', () => {
	setAudioPreferences({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.4,
		musicVolume: 0.3,
		fxVolume: 0.5
	})
	const raw = localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)
	if (raw === null) {
		throw new Error('expected audio preferences to be set')
	}
	expect(JSON.parse(raw)).toEqual({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.4,
		musicVolume: 0.3,
		fxVolume: 0.5
	})
})

test('reads new-shape values written by a previous session', () => {
	localStorage.setItem(
		AUDIO_PREFERENCES_STORAGE_KEY,
		JSON.stringify({
			muted: true,
			masterVolume: 0.1,
			musicVolume: 0.2,
			fxVolume: 0.3
		})
	)
	expect(getAudioPreferences()).toEqual({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.1,
		musicVolume: 0.2,
		fxVolume: 0.3
	})
})

test('reads stored per-bus mute flags', () => {
	localStorage.setItem(
		AUDIO_PREFERENCES_STORAGE_KEY,
		JSON.stringify({
			muted: false,
			musicMuted: true,
			fxMuted: false,
			masterVolume: 0.5,
			musicVolume: 0.5,
			fxVolume: 0.5
		})
	)
	expect(getAudioPreferences()).toEqual({
		muted: false,
		musicMuted: true,
		fxMuted: false,
		masterVolume: 0.5,
		musicVolume: 0.5,
		fxVolume: 0.5
	})
})

test('falls back to defaults when stored value is not valid JSON', () => {
	localStorage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, '}{corrupt')
	expect(getAudioPreferences()).toEqual(DEFAULTS)
})

test('falls back to defaults when stored value has the wrong shape', () => {
	localStorage.setItem(
		AUDIO_PREFERENCES_STORAGE_KEY,
		JSON.stringify({ masterVolume: 'loud' })
	)
	expect(getAudioPreferences()).toEqual(DEFAULTS)
})

test('clamps volumes above 1 down to 1 on set', () => {
	setAudioPreferences({
		muted: false,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 1.5,
		musicVolume: 2,
		fxVolume: 3
	})
	const prefs = getAudioPreferences()
	expect(prefs.masterVolume).toBe(1)
	expect(prefs.musicVolume).toBe(1)
	expect(prefs.fxVolume).toBe(1)
})

test('clamps volumes below 0 up to 0 on set', () => {
	setAudioPreferences({
		muted: false,
		musicMuted: false,
		fxMuted: false,
		masterVolume: -0.2,
		musicVolume: -1,
		fxVolume: -5
	})
	const prefs = getAudioPreferences()
	expect(prefs.masterVolume).toBe(0)
	expect(prefs.musicVolume).toBe(0)
	expect(prefs.fxVolume).toBe(0)
})

test('subscribe fires with the new preferences after set', () => {
	const listener = vi.fn<() => void>()
	const unsubscribe = subscribeAudioPreferences(listener)
	setAudioPreferences({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.3,
		musicVolume: 0.4,
		fxVolume: 0.5
	})
	expect(listener).toHaveBeenCalledWith({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.3,
		musicVolume: 0.4,
		fxVolume: 0.5
	})
	unsubscribe()
})

test('unsubscribe stops further notifications', () => {
	const listener = vi.fn<() => void>()
	const unsubscribe = subscribeAudioPreferences(listener)
	unsubscribe()
	setAudioPreferences({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.5,
		musicVolume: 0.5,
		fxVolume: 0.5
	})
	expect(listener).not.toHaveBeenCalled()
})

test('toggleMute flips muted from false to true and preserves volumes', () => {
	setAudioPreferences({
		muted: false,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.6,
		musicVolume: 0.4,
		fxVolume: 0.7
	})
	toggleMute()
	expect(getAudioPreferences()).toEqual({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.6,
		musicVolume: 0.4,
		fxVolume: 0.7
	})
})

test('toggleMute notifies subscribers with the new preferences', () => {
	const listener = vi.fn<() => void>()
	const unsubscribe = subscribeAudioPreferences(listener)
	toggleMute()
	expect(listener).toHaveBeenCalledWith({ ...DEFAULTS, muted: true })
	unsubscribe()
})

test('toggleMusicMute flips music mute independently of master mute', () => {
	toggleMusicMute()
	expect(getAudioPreferences()).toEqual({ ...DEFAULTS, musicMuted: true })
	toggleMusicMute()
	expect(getAudioPreferences()).toEqual(DEFAULTS)
})

test('toggleFxMute flips fx mute independently of master mute', () => {
	toggleFxMute()
	expect(getAudioPreferences()).toEqual({ ...DEFAULTS, fxMuted: true })
})

test('setMasterVolume updates only master and preserves the rest', () => {
	setAudioPreferences({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.3,
		musicVolume: 0.4,
		fxVolume: 0.5
	})
	setMasterVolume(0.85)
	expect(getAudioPreferences()).toEqual({
		muted: true,
		musicMuted: false,
		fxMuted: false,
		masterVolume: 0.85,
		musicVolume: 0.4,
		fxVolume: 0.5
	})
})

test('setMusicVolume only touches music', () => {
	setMusicVolume(0.2)
	expect(getAudioPreferences()).toEqual({ ...DEFAULTS, musicVolume: 0.2 })
})

test('setFxVolume only touches fx', () => {
	setFxVolume(0.25)
	expect(getAudioPreferences()).toEqual({ ...DEFAULTS, fxVolume: 0.25 })
})

test('setMasterVolume clamps above 1', () => {
	setMasterVolume(2)
	expect(getAudioPreferences().masterVolume).toBe(1)
})

test('setMasterVolume clamps below 0', () => {
	setMasterVolume(-1)
	expect(getAudioPreferences().masterVolume).toBe(0)
})
