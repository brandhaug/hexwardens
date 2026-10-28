import { type Intent } from '@hexwardens/game-logic/dispatch'
import { type GameState } from '@hexwardens/game-logic/game'
import { type BroadcastEvent } from '@hexwardens/game-logic/multiplayer/types'

/**
 * Outcome of {@link MatchClient.submitIntent}. `accepted` means the Intent
 * was committed against the authoritative engine — what "committed" means is
 * adapter-specific (see the timing notes on {@link MatchClient.submitIntent}).
 *
 * - `notAllowed` — the local Player cannot act right now (not their Turn,
 *   spectator, or a previous Action is still awaiting acknowledgment).
 *   No message: this is a gating refusal, not an engine rejection.
 * - `invalid` — the engine rejected the Intent. `message` carries the
 *   engine's rejection text.
 */
export type IntentSubmission =
	| { readonly accepted: true }
	| {
			readonly accepted: false
			readonly reason: 'notAllowed' | 'invalid'
			readonly message: string | null
	  }

/**
 * The Match seam shared by the offline `/game` route and the online
 * `/multiplayer-game` route. Both routes render the same game UI against the
 * same contract: a subscribable local view of an authoritative Match, eager
 * Action commitment per ADR-0010 (no client-side staging, no in-Turn undo),
 * and the broadcast-event stream that drives audio/animations.
 *
 * Two adapters implement it:
 * - {@link createOfflineMatchClient} (`offline-match-client.ts`) wraps the
 *   in-process `OfflineMatchHandle`. Actions await local persistence:
 *   when `submitIntent` resolves with `accepted`, `getGameState()` already
 *   reflects the committed Action and the result is definitive.
 * - {@link createMultiplayerMatchClient} (`multiplayer-match-client.ts`)
 *   wraps the WebSocket `GameClient` transport. `accepted` means the Intent
 *   passed a local optimistic dispatch and was eager-sent to the server;
 *   `getGameState()` reflects the optimistic overlay until the server's
 *   next authoritative projection (or rejection) lands. `canAct()` is
 *   `false` while an Action is in flight (single-flight lock).
 *
 * Fog-of-war contract: `getGameState()` is always the local viewer's
 * projection. Multiplayer state is server-projected `FilteredGameState`
 * (never re-derived client-side); offline state comes from the local
 * authoritative match, with the route deriving its view via `snapshotFor`.
 */
export interface MatchClient {
	/**
	 * Current effective game state for the local viewer, or `null` when no
	 * state exists yet (multiplayer: before the first server projection
	 * arrives; offline: never `null`). Referentially stable between change
	 * notifications — safe as a `useSyncExternalStore` snapshot.
	 */
	getGameState(): GameState | null
	/**
	 * Subscribe to state changes (authoritative pushes, optimistic
	 * applies/rollbacks, act-gating flips). Returns an unsubscribe function.
	 */
	subscribe(listener: () => void): () => void
	/** `true` when the local Player may submit an Intent right now. */
	canAct(): boolean
	/**
	 * Submit an Intent to the authoritative engine. Eager commitment per
	 * ADR-0010 — there is no staging and no in-Turn undo. Timing semantics
	 * differ per adapter: offline awaits durable local commit (the result is the
	 * engine's real verdict); multiplayer applies optimistically and
	 * eager-sends (`accepted` = in transit, awaiting server acknowledgment —
	 * a later server rejection rolls the overlay back and surfaces via the
	 * route's `actionResult` handling).
	 */
	submitIntent(intent: Intent): IntentSubmission | Promise<IntentSubmission>
	/**
	 * End the local Player's Turn. Carries no payload — every Action is
	 * already committed (ADR-0010). Callers gate on {@link canAct}; the
	 * adapters forward unconditionally like the routes historically did.
	 */
	endTurn(): void | Promise<void>
	/**
	 * Subscribe to the Match's broadcast-event stream (`turnEvents`) —
	 * consumed by audio, animations, and Daily-Challenge-style projections.
	 * Returns an unsubscribe function.
	 */
	subscribeBroadcastEvents(
		listener: (events: readonly BroadcastEvent[]) => void
	): () => void
}
