import {
	getAudioPreferences,
	subscribeAudioPreferences
} from '../audio-preferences'
import {
	mapGameAudioEvent,
	type GameAudioEvent,
	type SfxName
} from './audio-events'
import { AudioManager, type AudioVolumes } from './audio-manager'

/**
 * Process-singleton instance of the AudioManager. Construction is cheap;
 * the AudioContext is only built on the first `prepare()` call (typically
 * a user gesture). Tests that need a fresh manager should construct one
 * directly via `new AudioManager(...)` instead of reaching through this
 * accessor.
 */
let manager: AudioManager | null = null
let prefsSubscribed = false

function preferencesToVolumes(
	prefs: ReturnType<typeof getAudioPreferences>
): AudioVolumes {
	// Per-bus mutes zero the relevant gain node directly; the master `muted`
	// flag is what the AudioManager understands as "silence the whole graph".
	// Setting music: 0 keeps the slider's remembered value intact while still
	// effectively silencing the bus.
	return {
		master: prefs.masterVolume,
		music: prefs.musicMuted ? 0 : prefs.musicVolume,
		fx: prefs.fxMuted ? 0 : prefs.fxVolume,
		muted: prefs.muted
	}
}

export function getAudioManager(): AudioManager {
	if (manager) {
		return manager
	}
	const prefs = getAudioPreferences()
	manager = new AudioManager({ initialVolumes: preferencesToVolumes(prefs) })
	if (!prefsSubscribed) {
		subscribeAudioPreferences((next) => {
			manager?.setVolumes(preferencesToVolumes(next))
		})
		prefsSubscribed = true
	}
	return manager
}

/**
 * Apply a single `GameAudioEvent` through the active manager. Returns
 * the routed `(bus, sound)` pair so tests and the hook can assert what
 * fired without instrumenting the AudioManager itself. `null` means the
 * event was intentionally silent under the current local-player view.
 */
export function playGameAudioEvent(
	event: GameAudioEvent,
	mgr: AudioManager = getAudioManager()
): ReturnType<typeof mapGameAudioEvent> {
	const out = mapGameAudioEvent(event)
	if (out === null) {
		return null
	}
	if (out.bus === 'announcer') {
		mgr.playStinger(out.stinger)
	} else {
		mgr.playSfx(out.sfx)
	}
	return out
}

/**
 * Direct UI-affordance shortcut. The PRD allows UI components to fire
 * pure-UI sounds (selection, deselection, etc.) without going through
 * the broadcast event pipeline; the hook still owns gameplay-driven
 * audio. Centralising the call here keeps every `playSfx` reachable from
 * one symbol.
 */
export function playUiSfx(
	name: SfxName,
	mgr: AudioManager = getAudioManager()
): void {
	mgr.playSfx(name)
}
