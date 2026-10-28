import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type BroadcastEvent } from '@hexwardens/game-logic/multiplayer/types'
import { assertNever } from '@hexwardens/game-logic/type-utils'

/**
 * Names of every gameplay sound effect the audio service ships. The set is
 * a closed union — adding a new sound means a new entry here, a recipe in
 * `sfx-definitions.ts`, and a row in `mapGameAudioEvent` below. The
 * compiler enforces all three through the discriminant, which is the
 * single contract every UI surface and test pins to.
 */
export type SfxName =
	// UI-facing — fired directly by the routes for affordances the player
	// sees in the same frame they make a choice (no game-logic broadcast).
	| 'select'
	| 'deselect'
	| 'move'
	| 'action'
	| 'turnEnd'
	// Gameplay-facing — fired by the audio hook in response to broadcast
	// events or state diffs, never by individual UI components.
	| 'unitDamage'
	| 'unitDeath'
	| 'villageCaptured'
	| 'techComplete'
	| 'buildComplete'
	| 'levelUp'
	| 'enemyTurnStart'
	| 'yourTurnStart'
	| 'victory'
	| 'defeat'
	// Toast-facing — short bright chord paired with the achievement-unlock
	// toast. Routed through the FX bus so it ducks under music like other
	// UI cues but is louder than gameplay SFX so it cuts through.
	| 'achievement'

/**
 * Names of stinger cues routed through the announcer DSP chain. Stingers
 * carry the most narratively-loaded moments in the match — currently just
 * "you took or lost a capital" — and are the seam where pre-recorded voice
 * clips will drop in (they will share the same chain unchanged).
 */
export type StingerName = 'capitalCaptured'

/**
 * Discriminated union of game-audio events. The web app derives these from
 * `BroadcastEvent`s and from state diffs, then the audio service maps each
 * one to a `(bus, sound)` pair. The split of narrative concerns into a
 * typed event lets the test contract pin "given this event, this sound
 * fires" without coupling to the game-logic shape changes.
 */
export type GameAudioEvent =
	| { kind: 'unitDamage'; localPlayerInvolved: boolean }
	| { kind: 'unitDeath'; localPlayerInvolved: boolean }
	| { kind: 'villageCaptured'; capturedByLocalPlayer: boolean }
	| { kind: 'capitalCaptured'; capturedByLocalPlayer: boolean }
	| { kind: 'techComplete'; tribe: Tribe }
	| { kind: 'buildComplete'; tribe: Tribe }
	| { kind: 'levelUp'; tribe: Tribe }
	| { kind: 'enemyTurnStart' }
	| { kind: 'yourTurnStart' }
	| { kind: 'victory' }
	| { kind: 'defeat' }

/**
 * Output of the mapping table. `null` means "no audio for this event under
 * the current local-player context" (e.g., a research event for an
 * opponent we cannot see). Stinger entries are intentionally separated
 * from SFX because they take a different code path (DSP chain and a
 * stricter retrigger throttle).
 */
export type AudioEventOutput =
	| { bus: 'fx' | 'master' | 'music'; sfx: SfxName }
	| { bus: 'announcer'; stinger: StingerName }
	| null

/**
 * Pure mapping from a `GameAudioEvent` to the `(bus, sound)` pair the
 * audio service should fire. This is the contract that tests pin against
 * — implementation details (osc shapes, decay envelopes, music routing)
 * are below this seam.
 */
export function mapGameAudioEvent(event: GameAudioEvent): AudioEventOutput {
	switch (event.kind) {
		case 'unitDamage': {
			return event.localPlayerInvolved ? { bus: 'fx', sfx: 'unitDamage' } : null
		}
		case 'unitDeath': {
			return event.localPlayerInvolved ? { bus: 'fx', sfx: 'unitDeath' } : null
		}
		case 'villageCaptured': {
			return { bus: 'fx', sfx: 'villageCaptured' }
		}
		case 'capitalCaptured': {
			return { bus: 'announcer', stinger: 'capitalCaptured' }
		}
		case 'techComplete': {
			return { bus: 'fx', sfx: 'techComplete' }
		}
		case 'buildComplete': {
			return { bus: 'fx', sfx: 'buildComplete' }
		}
		case 'levelUp': {
			return { bus: 'fx', sfx: 'levelUp' }
		}
		case 'enemyTurnStart': {
			return { bus: 'fx', sfx: 'enemyTurnStart' }
		}
		case 'yourTurnStart': {
			return { bus: 'fx', sfx: 'yourTurnStart' }
		}
		case 'victory': {
			return { bus: 'fx', sfx: 'victory' }
		}
		case 'defeat': {
			return { bus: 'fx', sfx: 'defeat' }
		}
		default: {
			return assertNever(event)
		}
	}
}

/**
 * Lower the broadcast-event stream into the audio-event stream. Pure: no
 * I/O, no AudioContext. The hook calls this on every `turnEvents` payload
 * and feeds the result into `playGameAudioEvent`. State-diff-derived
 * events (combat damage / village capture) are produced by a separate
 * helper because they require pre/next state pairs.
 */
export function broadcastEventToGameAudio(
	event: BroadcastEvent,
	localTribe: Tribe | null
): GameAudioEvent[] {
	switch (event.type) {
		case 'research': {
			if (!event.completed) {
				return []
			}
			if (localTribe !== null && event.tribe !== localTribe) {
				return []
			}
			return [{ kind: 'techComplete', tribe: event.tribe }]
		}
		case 'villageLevel': {
			if (event.levelUps <= 0) {
				return []
			}
			if (localTribe !== null && event.tribe !== localTribe) {
				return []
			}
			return [{ kind: 'levelUp', tribe: event.tribe }]
		}
		case 'turnRotated': {
			if (localTribe === null) {
				return []
			}
			// Heads-up that *we* are no longer steering; the next turn belongs
			// to someone else. `from === localTribe` guards against echoing
			// the cue when an opponent's turn ticks from one bot to the next.
			if (event.from === localTribe && event.to !== localTribe) {
				return [{ kind: 'enemyTurnStart' }]
			}
			// The board is ours again. Pairs with the "Your Move" banner; the
			// `from !== localTribe` guard keeps single-player edge states from
			// chiming when a turn rotates from us back to us.
			if (event.to === localTribe && event.from !== localTribe) {
				return [{ kind: 'yourTurnStart' }]
			}
			return []
		}
		case 'gameOver': {
			if (localTribe === null) {
				return event.winner ? [{ kind: 'victory' }] : []
			}
			return [
				event.winner === localTribe ? { kind: 'victory' } : { kind: 'defeat' }
			]
		}
		case 'salary': {
			// Salary ticks are noisy and per-village — handled visually only.
			return []
		}
		case 'villageCaptured': {
			// Capture cues are derived from state diffs in
			// `deriveStateDiffAudioEvents` so the same flip plays identically
			// in offline `/game` and online `/multiplayer-game`. Lowering it
			// here too would double-fire.
			return []
		}
		default: {
			return assertNever(event)
		}
	}
}
