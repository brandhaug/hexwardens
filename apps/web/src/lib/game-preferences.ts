import { Option, Predicate, Schema } from 'effect'
/**
 * Local, per-device gameplay preferences — everything that is not audio
 * and not gameplay state. Persists to `localStorage` under a single key,
 * survives reloads, and notifies subscribers on every change.
 *
 * Three knobs:
 *   - motionPreference: 'auto' (respect prefers-reduced-motion) vs 'reduce'
 *     (force-reduce regardless of system setting). Mirrors the OS toggle so
 *     a player on a battery-saving phone can dial chrome animations down
 *     without changing their system pref. When set to `reduce`, the html
 *     element gets `data-reduced-motion='true'` so CSS rules can override
 *     even animations that ignore `prefers-reduced-motion`.
 *   - cameraSpeed: multiplier on OrbitControls pan/rotate/zoom. Default 1.0;
 *     a touch-only player may prefer 0.6, a power user with a trackpad 1.4.
 *   - highlightOpacity: multiplier on tile-highlight overlay opacities.
 *     Players who find the selection rings distracting can dial them down;
 *     players on a glare-heavy screen can boost them.
 */

export type MotionPreference = 'auto' | 'reduce'

export type GamePreferences = {
	readonly confirmEndTurn: boolean
	readonly motionPreference: MotionPreference
	readonly cameraSpeed: number
	readonly highlightOpacity: number
}

export const GAME_PREFERENCES_STORAGE_KEY = 'hexwardens.preferences:v1'

const DEFAULTS: GamePreferences = {
	confirmEndTurn: true,
	motionPreference: 'auto',
	cameraSpeed: 1,
	highlightOpacity: 1
}

const CAMERA_SPEED_MIN = 0.4
const CAMERA_SPEED_MAX = 2
const HIGHLIGHT_OPACITY_MIN = 0.3
const HIGHLIGHT_OPACITY_MAX = 1.5

const SERVER_SNAPSHOT: GamePreferences = { ...DEFAULTS }

const listeners = new Set<(prefs: GamePreferences) => void>()

let cached: GamePreferences = { ...DEFAULTS }

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min
	}
	if (value < min) {
		return min
	}
	if (value > max) {
		return max
	}
	return value
}

function isMotionPreference(
	value: Schema.Json | undefined
): value is MotionPreference {
	return value === 'auto' || value === 'reduce'
}

function parseStored(value: Schema.JsonObject): GamePreferences {
	return {
		confirmEndTurn: Predicate.isBoolean(value.confirmEndTurn)
			? value.confirmEndTurn
			: DEFAULTS.confirmEndTurn,
		motionPreference: isMotionPreference(value.motionPreference)
			? value.motionPreference
			: DEFAULTS.motionPreference,
		cameraSpeed: clamp(
			Predicate.isNumber(value.cameraSpeed)
				? value.cameraSpeed
				: DEFAULTS.cameraSpeed,
			CAMERA_SPEED_MIN,
			CAMERA_SPEED_MAX
		),
		highlightOpacity: clamp(
			Predicate.isNumber(value.highlightOpacity)
				? value.highlightOpacity
				: DEFAULTS.highlightOpacity,
			HIGHLIGHT_OPACITY_MIN,
			HIGHLIGHT_OPACITY_MAX
		)
	}
}

const decodeStoredJson = Schema.decodeUnknownOption(
	Schema.fromJsonString(Schema.JsonObject)
)

function readFromStorage(): GamePreferences {
	if (typeof localStorage === 'undefined') {
		return { ...DEFAULTS }
	}
	const raw = localStorage.getItem(GAME_PREFERENCES_STORAGE_KEY)
	if (raw === null) {
		return { ...DEFAULTS }
	}
	return Option.match(decodeStoredJson(raw), {
		onNone: () => ({ ...DEFAULTS }),
		onSome: parseStored
	})
}

function prefsEqual(a: GamePreferences, b: GamePreferences): boolean {
	return (
		a.confirmEndTurn === b.confirmEndTurn &&
		a.motionPreference === b.motionPreference &&
		a.cameraSpeed === b.cameraSpeed &&
		a.highlightOpacity === b.highlightOpacity
	)
}

function applySideEffects(prefs: GamePreferences): void {
	if (typeof document === 'undefined') {
		return
	}
	const root = document.documentElement
	if (prefs.motionPreference === 'reduce') {
		root.dataset.reducedMotion = 'true'
	} else {
		delete root.dataset.reducedMotion
	}
}

export function getGamePreferences(): GamePreferences {
	if (typeof window === 'undefined') {
		return SERVER_SNAPSHOT
	}
	const fresh = readFromStorage()
	if (prefsEqual(cached, fresh)) {
		return cached
	}
	cached = fresh
	applySideEffects(cached)
	return cached
}

export function getServerGamePreferences(): GamePreferences {
	return SERVER_SNAPSHOT
}

function commit(next: GamePreferences): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify(next))
	}
	if (prefsEqual(cached, next)) {
		return
	}
	cached = next
	applySideEffects(cached)
	for (const listener of listeners) {
		listener(cached)
	}
}

export function setMotionPreference(value: MotionPreference): void {
	commit({ ...getGamePreferences(), motionPreference: value })
}

export function toggleMotionPreference(): void {
	const current = getGamePreferences()
	setMotionPreference(current.motionPreference === 'reduce' ? 'auto' : 'reduce')
}

export function setCameraSpeed(value: number): void {
	commit({
		...getGamePreferences(),
		cameraSpeed: clamp(value, CAMERA_SPEED_MIN, CAMERA_SPEED_MAX)
	})
}

export function setHighlightOpacity(value: number): void {
	commit({
		...getGamePreferences(),
		highlightOpacity: clamp(value, HIGHLIGHT_OPACITY_MIN, HIGHLIGHT_OPACITY_MAX)
	})
}

export function subscribeGamePreferences(
	listener: (prefs: GamePreferences) => void
): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export const cameraSpeedRange = {
	min: CAMERA_SPEED_MIN,
	max: CAMERA_SPEED_MAX
} as const

export const highlightOpacityRange = {
	min: HIGHLIGHT_OPACITY_MIN,
	max: HIGHLIGHT_OPACITY_MAX
} as const

// Initialize side effects on first import (client only). Safe under SSR
// because applySideEffects guards on document existence.
if (typeof window !== 'undefined') {
	applySideEffects(readFromStorage())
}

export function setConfirmEndTurn(value: boolean): void {
	commit({ ...getGamePreferences(), confirmEndTurn: value })
}
