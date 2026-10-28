import { Result } from 'effect'
import { executeCommittedIntent } from '@hexwardens/game-logic/action-execution'
import { type Intent } from '@hexwardens/game-logic/dispatch'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { intentToClientMessage } from '@hexwardens/game-logic/match/wire-intent'
import {
	type BroadcastEvent,
	type ClientMessage,
	type FilteredGameState
} from '@hexwardens/game-logic/multiplayer/types'
import { type PlayerState } from '@hexwardens/game-logic/player/player-state'
import { type IntentSubmission, type MatchClient } from './match-client'

/**
 * The slice of the WebSocket `GameClient` the adapter needs. Narrow on
 * purpose: connection lifecycle, reconnect, and the rest of the wire surface
 * stay with the route — this seam only carries gameplay submission.
 */
export interface MultiplayerTransport {
	send(msg: ClientMessage): void
	endTurn(): void
}

/** The fields of the server's `gameState` message the adapter consumes. */
export interface ServerGameStateUpdate {
	readonly state: FilteredGameState
	readonly viewer: Tribe
	readonly currentTurn: Tribe
}

/**
 * Multiplayer adapter for the {@link MatchClient} seam, plus the feed
 * methods the route's `ServerMessageHandlers` call to push server messages
 * into it. The route still owns the `GameClient` (connection status, timers,
 * chronicle, toasts); the adapter owns the eager-commitment gameplay loop.
 */
export interface MultiplayerMatchClient extends MatchClient {
	submitIntent(intent: Intent): IntentSubmission
	endTurn(): void
	/**
	 * Authoritative server projection landed. Replaces the effective state,
	 * drops any optimistic overlay (the push is the acknowledgment), and
	 * unlocks the next submission.
	 */
	receiveGameState(update: ServerGameStateUpdate): void
	/**
	 * Server verdict for the in-flight Action. Success is a no-op (the
	 * matching `gameState` push clears the overlay); failure rolls the
	 * optimistic overlay back and unlocks new clicks. No server `gameState`
	 * push follows a rejection, so this is the only rollback path.
	 */
	receiveActionResult(result: {
		readonly success: boolean
		readonly message: string
	}): void
	/** Fan a `turnEvents` payload out to broadcast-event subscribers. */
	receiveTurnEvents(events: readonly BroadcastEvent[]): void
}

export interface CreateMultiplayerMatchClientArgs {
	readonly transport: MultiplayerTransport
	/**
	 * Fired when the local optimistic dispatch rejects an Intent before any
	 * network round-trip (e.g. illegal target). Routes surface a toast here.
	 * Server-side rejections arrive via `receiveActionResult` and stay the
	 * route's `actionResult` handler's concern.
	 */
	readonly onIntentRejected?: (message: string) => void
}

/**
 * Multiplayer adapter wrapping the WebSocket transport. Preserves the
 * pre-existing optimistic-apply behaviour exactly (ADR-0010 eager
 * commitment): `submitIntent` applies `executeCommittedIntent` locally
 * against the server-projected `FilteredGameState` for immediate feedback,
 * eager-sends the Intent, and holds a single-flight lock (`canAct()` is
 * `false`) until the server's next `gameState` push (success) or
 * `actionResult` rejection (rollback) lands.
 *
 * Fog-of-war: the client never re-derives fog — the optimistic dispatch
 * runs over the state the server already projected for this viewer.
 */
/** The server projection re-seeded the way the route historically did. */
type SeededViewerProjection = FilteredGameState & { readonly seed: number }

/**
 * Bridges the wire type (`FilteredGameState`) to the `GameState` every
 * downstream display surface (board rendering, unit cycler)
 * consumes. The runtime value is unchanged: fog tiles stay in the grid (the
 * renderer maps `terrain === null` to fog clouds) and `playerStates` stays
 * the server's viewer-scoped projection — that *is* this viewer's complete
 * knowledge of the match, which is exactly what the client is allowed to
 * operate on (fog is server-trusted; see apps/web/AGENTS.md invariant 1).
 * The runtime check is structural sanity only; the type-level gap is
 * deliberately closed at this single seam instead of scattering casts
 * downstream.
 */
function isViewerGameState(
	state: GameState | SeededViewerProjection
): state is GameState {
	return state.units.board.every((row) => Array.isArray(row))
}

function simulationOpponent(player: PlayerState): PlayerState {
	// Older projections can omit private fields. Defaults exist only in the
	// command workspace; the original opponent record stays in the UI projection.
	const privateFields: Partial<PlayerState> = player
	return {
		...player,
		money: privateFields.money ?? 0,
		exploration: privateFields.exploration ?? {},
		researchedTechs: privateFields.researchedTechs ?? [],
		researchInProgress: privateFields.researchInProgress ?? null
	}
}

/** Unknown tiles are absent from the command workspace, never invented terrain. */
function commandState(state: SeededViewerProjection, viewer: Tribe): GameState {
	return {
		...state,
		units: {
			...state.units,
			board: state.units.board.map((row) =>
				row.map((tile) => (tile?.terrain === null ? null : tile))
			)
		},
		playerStates: Object.fromEntries(
			Object.entries(state.playerStates).map(([tribe, player]) => [
				tribe,
				tribe === viewer ? player : simulationOpponent(player)
			])
		)
	}
}

function replaceViewerEntry<T>(
	base: Partial<Record<Tribe, T>>,
	next: Partial<Record<Tribe, T>>,
	viewer: Tribe
): Partial<Record<Tribe, T>> {
	const entry = next[viewer]
	if (entry === undefined) {
		return Object.fromEntries(
			Object.entries(base).filter(([tribe]) => tribe !== viewer)
		)
	}
	return { ...base, [viewer]: entry }
}

function optimisticProjection(
	base: SeededViewerProjection,
	next: GameState,
	viewer: Tribe
): SeededViewerProjection {
	return {
		// The partial board cannot establish elimination or the match outcome.
		...base,
		units: {
			...next.units,
			board: base.units.board.map((row, r) =>
				row.map((tile, q) =>
					tile?.terrain ? (next.units.board[r]?.[q] ?? null) : tile
				)
			)
		},
		nextUnitId: next.nextUnitId,
		// Simulation defaults and opponent exploration never enter the UI state.
		playerStates: replaceViewerEntry(
			base.playerStates,
			next.playerStates,
			viewer
		),
		pendingPerkChoices: replaceViewerEntry(
			base.pendingPerkChoices,
			next.pendingPerkChoices,
			viewer
		),
		pendingVillageLevelUps: replaceViewerEntry(
			base.pendingVillageLevelUps,
			next.pendingVillageLevelUps,
			viewer
		)
	}
}

export function createMultiplayerMatchClient(
	args: CreateMultiplayerMatchClientArgs
): MultiplayerMatchClient {
	// Server-projected state, re-seeded the way the route historically did
	// (`{ seed: 0, ...state }`) so downstream GameState consumers — dispatch,
	// unit cycler, layout — see the shape they expect. Fog filtering already
	// happened server-side.
	let serverState: SeededViewerProjection | null = null
	// Optimistic overlay. `!== null` means an Action is in flight and blocks
	// new submissions (single-flight).
	let optimisticState: SeededViewerProjection | null = null
	let viewer: Tribe | null = null
	let currentTurn: Tribe | null = null

	const listeners = new Set<() => void>()
	const broadcastListeners = new Set<
		(events: readonly BroadcastEvent[]) => void
	>()

	const emit = (): void => {
		for (const listener of listeners) {
			listener()
		}
	}

	const canAct = (): boolean =>
		viewer !== null && currentTurn === viewer && optimisticState === null

	return {
		getGameState: () => {
			const state = optimisticState ?? serverState
			return state !== null && isViewerGameState(state) ? state : null
		},

		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		canAct,

		submitIntent(intent): IntentSubmission {
			const base = optimisticState ?? serverState
			if (!canAct() || base === null || viewer === null) {
				return { accepted: false, reason: 'notAllowed', message: null }
			}
			// Apply optimistically for immediate feedback. Failure on the local
			// dispatch surfaces immediately without burning a server round-trip.
			const result = executeCommittedIntent(
				commandState(base, viewer),
				viewer,
				intent
			)
			if (Result.isFailure(result)) {
				args.onIntentRejected?.(result.failure.message)
				return {
					accepted: false,
					reason: 'invalid',
					message: result.failure.message
				}
			}
			optimisticState = optimisticProjection(
				base,
				result.success.nextState,
				viewer
			)
			args.transport.send(intentToClientMessage(intent))
			emit()
			return { accepted: true }
		},

		endTurn() {
			args.transport.endTurn()
		},

		subscribeBroadcastEvents(listener) {
			broadcastListeners.add(listener)
			return () => {
				broadcastListeners.delete(listener)
			}
		},

		receiveGameState(update) {
			serverState = { seed: 0, ...update.state }
			optimisticState = null
			viewer = update.viewer
			currentTurn = update.currentTurn
			emit()
		},

		receiveActionResult(result) {
			if (result.success) {
				return
			}
			if (optimisticState === null) {
				return
			}
			optimisticState = null
			emit()
		},

		receiveTurnEvents(events) {
			for (const listener of broadcastListeners) {
				listener(events)
			}
		}
	}
}
