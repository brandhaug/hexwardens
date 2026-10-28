import { useEffect, useRef } from 'react'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	type BroadcastEvent,
	type FilteredGameState
} from '@hexwardens/game-logic/multiplayer/types'
import {
	broadcastEventToGameAudio,
	type GameAudioEvent
} from '@/lib/audio/audio-events'
import { getAudioManager, playGameAudioEvent } from '@/lib/audio/audio-service'
import { deriveStateDiffAudioEvents } from '@/lib/audio/state-diff-events'

/**
 * Subscribe the audio service to gameplay events. The hook is the *only*
 * place that translates `BroadcastEvent`s and state diffs into audio
 * calls — UI components call `playUiSfx` for affordances they trigger
 * directly (selection, end-turn confirmation), but everything else
 * (combat, captures, research, level-ups) flows through this hook so
 * the same gameplay action makes the same sound regardless of which
 * surface initiated it.
 */
export interface UseGameAudioArgs {
	/**
	 * Current `FilteredGameState`. The hook compares successive snapshots
	 * to derive combat / capture cues. Pass `null` while the match is
	 * still bootstrapping; the hook treats `null → state` as a no-op
	 * baseline so the player isn't blasted with cues at session start.
	 */
	state: FilteredGameState | null
	/**
	 * The tribe the local human is playing. `null` = spectator. The
	 * hook uses this to decide whether to gate cues on local-player
	 * involvement and to translate `turnRotated` into an enemy-turn cue.
	 */
	localTribe: Tribe | null
	/**
	 * Stream of broadcast events. Online: pass each `turnEvents` payload
	 * received over the WebSocket. Offline: pass the events surfaced by
	 * the offline match handle (the offline path has no native broadcast
	 * stream, so callers can pass `null` and rely on state diffs).
	 */
	broadcastEvents?: readonly BroadcastEvent[] | null
}

/**
 * The hook surface is intentionally narrow. Tests inject a stub
 * `playEvent` to assert what fired without instantiating the
 * AudioManager. Production callers don't pass the override.
 */
export interface UseGameAudioOverrides {
	playEvent?: (event: GameAudioEvent) => void
}

/**
 * Internal: walk a paired `(prevState, nextState)` and a list of
 * broadcast events through the lowering pipeline, fanning each out to
 * the audio service.
 */
function fireGameAudio(
	events: readonly GameAudioEvent[],
	override: UseGameAudioOverrides['playEvent']
): void {
	if (events.length === 0) {
		return
	}
	if (override) {
		for (const event of events) {
			override(event)
		}
		return
	}
	const mgr = getAudioManager()
	for (const event of events) {
		playGameAudioEvent(event, mgr)
	}
}

export function useGameAudio(
	args: UseGameAudioArgs,
	overrides: UseGameAudioOverrides = {}
): void {
	const { state, localTribe, broadcastEvents } = args
	const previousStateRef = useRef<FilteredGameState | null>(null)
	const lastSeenEventsRef = useRef<readonly BroadcastEvent[] | null>(null)

	// Lower broadcast events. We compare by reference, so every fresh
	// `turnEvents` payload from the WebSocket fires once, and stale
	// renders (state changed but events array stayed the same) skip.
	useEffect(() => {
		if (!broadcastEvents || broadcastEvents === lastSeenEventsRef.current) {
			return
		}
		lastSeenEventsRef.current = broadcastEvents
		const lowered: GameAudioEvent[] = []
		for (const event of broadcastEvents) {
			lowered.push(...broadcastEventToGameAudio(event, localTribe))
		}
		fireGameAudio(lowered, overrides.playEvent)
	}, [broadcastEvents, localTribe, overrides.playEvent])

	// Derive state-diff cues. The first non-null state is the baseline —
	// no cues fire on it (otherwise we'd emit "unit died" for every unit
	// the player joined into a mid-match snapshot).
	useEffect(() => {
		if (!state) {
			return
		}
		const previous = previousStateRef.current
		previousStateRef.current = state
		if (!previous) {
			return
		}
		const diffs = deriveStateDiffAudioEvents(previous, state, localTribe)
		fireGameAudio(diffs, overrides.playEvent)
	}, [state, localTribe, overrides.playEvent])
}
