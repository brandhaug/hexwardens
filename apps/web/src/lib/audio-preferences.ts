import { Option, Predicate, Schema } from 'effect'
/**
 * Per-device audio preferences, persisted to `localStorage`. Volumes are
 * floats clamped to [0, 1]. The master `muted` flag silences everything;
 * `musicMuted` / `fxMuted` let the player keep one bus active (e.g. music
 * off while FX stay on) without losing their remembered volume.
 */
export type AudioPreferences = {
	muted: boolean
	musicMuted: boolean
	fxMuted: boolean
	masterVolume: number
	musicVolume: number
	fxVolume: number
}

export const AUDIO_PREFERENCES_STORAGE_KEY = 'hexwardens.audio:v1'
const DEFAULTS: AudioPreferences = {
	muted: false,
	musicMuted: false,
	fxMuted: false,
	masterVolume: 0.7,
	musicVolume: 0.55,
	fxVolume: 0.85
}
const SERVER_SNAPSHOT: AudioPreferences = { ...DEFAULTS }

const listeners = new Set<(prefs: AudioPreferences) => void>()

let cached: AudioPreferences = { ...DEFAULTS }

function clamp01(value: number): number {
	if (!Number.isFinite(value)) {
		return 0
	}
	if (value < 0) {
		return 0
	}
	if (value > 1) {
		return 1
	}
	return value
}

function parseStoredPreferences(value: Schema.JsonObject): AudioPreferences {
	const muted = Predicate.isBoolean(value.muted) ? value.muted : DEFAULTS.muted
	const musicMuted = Predicate.isBoolean(value.musicMuted)
		? value.musicMuted
		: DEFAULTS.musicMuted
	const fxMuted = Predicate.isBoolean(value.fxMuted)
		? value.fxMuted
		: DEFAULTS.fxMuted

	const masterVolume = value.masterVolume
	const musicVolume = value.musicVolume
	const fxVolume = value.fxVolume

	if (
		Predicate.isNumber(masterVolume) &&
		Predicate.isNumber(musicVolume) &&
		Predicate.isNumber(fxVolume)
	) {
		return {
			muted,
			musicMuted,
			fxMuted,
			masterVolume: clamp01(masterVolume),
			musicVolume: clamp01(musicVolume),
			fxVolume: clamp01(fxVolume)
		}
	}

	return { ...DEFAULTS, muted, musicMuted, fxMuted }
}

const decodeStoredJson = Schema.decodeUnknownOption(
	Schema.fromJsonString(Schema.JsonObject)
)

function readFromStorage(): AudioPreferences {
	if (typeof localStorage === 'undefined') {
		return { ...DEFAULTS }
	}
	const raw = localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)
	if (raw === null) {
		return { ...DEFAULTS }
	}
	return Option.match(decodeStoredJson(raw), {
		onNone: () => ({ ...DEFAULTS }),
		onSome: parseStoredPreferences
	})
}

function prefsEqual(a: AudioPreferences, b: AudioPreferences): boolean {
	return (
		a.muted === b.muted &&
		a.musicMuted === b.musicMuted &&
		a.fxMuted === b.fxMuted &&
		a.masterVolume === b.masterVolume &&
		a.musicVolume === b.musicVolume &&
		a.fxVolume === b.fxVolume
	)
}

export function getAudioPreferences(): AudioPreferences {
	if (typeof window === 'undefined' && typeof localStorage === 'undefined') {
		return SERVER_SNAPSHOT
	}
	const fresh = readFromStorage()
	if (prefsEqual(cached, fresh)) {
		return cached
	}
	cached = fresh
	return cached
}

export function getServerAudioPreferences(): AudioPreferences {
	return SERVER_SNAPSHOT
}

export function setAudioPreferences(prefs: AudioPreferences): void {
	const clamped: AudioPreferences = {
		muted: prefs.muted,
		musicMuted: prefs.musicMuted,
		fxMuted: prefs.fxMuted,
		masterVolume: clamp01(prefs.masterVolume),
		musicVolume: clamp01(prefs.musicVolume),
		fxVolume: clamp01(prefs.fxVolume)
	}
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(clamped))
	}
	if (prefsEqual(cached, clamped)) {
		return
	}
	cached = clamped
	for (const listener of listeners) {
		listener(clamped)
	}
}

export function toggleMute(): void {
	const current = getAudioPreferences()
	setAudioPreferences({ ...current, muted: !current.muted })
}

export function toggleMusicMute(): void {
	const current = getAudioPreferences()
	setAudioPreferences({ ...current, musicMuted: !current.musicMuted })
}

export function toggleFxMute(): void {
	const current = getAudioPreferences()
	setAudioPreferences({ ...current, fxMuted: !current.fxMuted })
}

export function setMasterVolume(volume: number): void {
	const current = getAudioPreferences()
	setAudioPreferences({ ...current, masterVolume: volume })
}

export function setMusicVolume(volume: number): void {
	const current = getAudioPreferences()
	setAudioPreferences({ ...current, musicVolume: volume })
}

export function setFxVolume(volume: number): void {
	const current = getAudioPreferences()
	setAudioPreferences({ ...current, fxVolume: volume })
}

export function subscribeAudioPreferences(
	listener: (prefs: AudioPreferences) => void
): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
