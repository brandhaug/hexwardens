import { Result } from 'effect'
import {
	type MatchLogData,
	type MatchLifecycleEvent,
	type PersistenceError
} from './ports'
import { type Difficulty } from '../difficulty'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { type MatchResult, type ServerMessage } from '../multiplayer/types'
import { step } from './step'
import {
	type MatchCommand,
	type MatchEffect,
	type MatchState,
	type StepResult
} from './types'

/**
 * Single port that all match hosts (CF Durable Object, web offline path,
 * tests) implement. Each method corresponds 1:1 with a {@link MatchEffect}
 * variant; {@link runMatchCommand} dispatches each effect to the matching
 * method in the order `step` emitted them.
 *
 * Concrete adapters live with their hosts:
 * - `apps/game-server/src/match.ts` → embedded `MatchHost` adapter
 * - `packages/game-logic/src/match/offline.ts` → embedded via
 *   `createMatchLogic`'s default adapter
 * - tests → `createRecordingMatchHost` (see `recording-host.ts`)
 *
 * Sync vs. async signatures match the underlying primitives — Cloudflare DO
 * storage and broadcast operations are synchronous; only `endGame` (D1) and
 * `scheduleBotTurn` are awaited. Preserves the "save before await"
 * durability contract from the legacy `dispatchCommand`: non-bot effects
 * must not return promises that the orchestrator stalls on.
 *
 * Adding a new variant to {@link MatchEffect} forces a new method here and a
 * new `case` in `runMatchCommand`. The trailing `default: const exhaustive:
 * never = effect` guard turns any miss into a compile error in every host.
 */
export interface MatchHost extends MatchPublisher {
	/**
	 * Persist the post-step match state. The orchestrator only invokes this
	 * when `step` produced a referentially-new state (the `state !== before`
	 * convention is preserved). Failure leaves the prior state authoritative;
	 * no candidate effects or lifecycle observations may be published.
	 */
	saveState(state: MatchState): Result.Result<void, PersistenceError>
}

/** Post-commit effects. Runtime persistence belongs to MatchPersistence alone. */
export interface MatchPublisher {
	/**
	 * Project the match state to every connected tribe and ship the resulting
	 * `gameState` server messages. Implementations own fog projection
	 * (`buildFogFrame` + `projectFromFrame`).
	 *
	 * Collapses the `stateChanged` effect into one host call because every
	 * host (DO + offline) must run the same fog pipeline before a `gameState`
	 * send — keeping projection inside the host let DO and offline diverge
	 * silently before this refactor.
	 */
	projectState(state: MatchState): void
	/** Send a server message to a single tribe (action result, targeted error). */
	sendToTribe(tribe: Tribe, msg: ServerMessage): void
	/** Fan-out a server message to all connected tribes (turn timer, forfeit, …). */
	broadcastAll(msg: ServerMessage): void
	/**
	 * Match concluded; broadcast the `gameEnd` message and persist the result
	 * (D1 write, hence async). The orchestrator does not await this — it's
	 * fire-and-forget so a slow D1 write never blocks the in-memory
	 * transition from completing. Failures are reported out-of-band.
	 */
	endGame(result: MatchResult): Promise<void>
	/** Tear the match down and release storage. Idempotent in adapters. */
	destroyMatch(): void
	/** Structured-log a match event. Sync — never blocks the orchestrator. */
	log(event: string, data?: MatchLogData): void
	/**
	 * Schedule an async bot turn. The host owns:
	 *
	 * - **Cancellation** — if a `destroyMatch` / `init` lands while the
	 *   bot is computing, the host drops the resolution silently (and emits
	 *   its own stale lifecycle event).
	 * - **Recursion / re-dispatch** — when `runBotTurn` resolves, the host
	 *   re-enters its own dispatch loop with `{ kind: 'botTurnResolved' }`.
	 *   This keeps bot resolutions running against the *current* match state
	 *   (which may have shifted while the bot was computing) rather than a
	 *   captured stale state.
	 *
	 * Returns a `Promise<void>` that resolves once the bot turn (and any
	 * follow-on `botTurnResolved` dispatch) has settled. `runMatchCommand`
	 * surfaces this promise via `pendingBotTurns` so callers (e.g. the
	 * `pump` loop) can await bot quiescence before proceeding.
	 */
	scheduleBotTurn(
		tribe: Tribe,
		difficulty: Difficulty,
		gameState: GameState
	): Promise<void>
	/** Notify observers of a typed lifecycle fact (post-effect dispatch). */
	emitLifecycle(event: MatchLifecycleEvent): void
}

/**
 * Result of {@link runMatchCommand}. The post-step state is returned
 * synchronously so callers can update their state pointer immediately;
 * `pendingBotTurns` is the (possibly empty) list of `scheduleBotTurn`
 * promises that callers may await before proceeding.
 */
export type RunMatchCommandResult = {
	committed: boolean
	state: MatchState
	pendingBotTurns: Promise<void>[]
}

/**
 * Orchestrate a single {@link MatchCommand} against {@link host}.
 *
 * 1. Compute the candidate through the pure command reducer.
 * 2. Persist any mutation. A failure returns the original state immediately.
 * 3. Publish the committed effects in order, then notify lifecycle observers.
 *    Bot promises are returned separately so hosts can await quiescence.
 *
 * Returns the post-step `MatchState` plus any bot-turn promises so callers
 * can choose to wait for the chain to drain (production `pump`) or proceed
 * eagerly (tests).
 */
export function runMatchCommand(
	state: MatchState,
	command: MatchCommand,
	host: MatchHost,
	now: number
): RunMatchCommandResult {
	const result = step(state, command, now)
	const next = result.nextState
	const stateMutated = next !== state
	if (stateMutated && Result.isFailure(host.saveState(next))) {
		return { state, pendingBotTurns: [], committed: false }
	}
	return publishMatchTransition(result, host)
}

/** Interpret only a transition whose state has already been committed locally. */
export function publishMatchTransition(
	result: StepResult,
	host: MatchPublisher
): RunMatchCommandResult {
	const next = result.nextState

	const pendingBotTurns: Promise<void>[] = []
	for (const effect of result.effects) {
		const pending = dispatchEffect(effect, host, next)
		if (pending) {
			pendingBotTurns.push(pending)
		}
	}

	// Lifecycle fires after effects landed so observers see a consistent
	// post-broadcast world. Matches the legacy `dispatchCommand` ordering.
	for (const event of result.lifecycle) {
		host.emitLifecycle(event)
	}

	return { state: next, pendingBotTurns, committed: true }
}

function dispatchEffect(
	effect: MatchEffect,
	host: MatchPublisher,
	state: MatchState
): Promise<void> | null {
	switch (effect.t) {
		case 'stateChanged': {
			host.projectState(state)
			return null
		}
		case 'messageToTribe': {
			host.sendToTribe(effect.tribe, effect.msg)
			return null
		}
		case 'broadcast': {
			host.broadcastAll(effect.msg)
			return null
		}
		case 'gameEnded': {
			// Fire-and-forget — `endGame` does the D1 write asynchronously and
			// reports failures via the host's persistence-error channel.
			void host.endGame(effect.result)
			return null
		}
		case 'matchDestroyed': {
			host.destroyMatch()
			return null
		}
		case 'log': {
			host.log(effect.event, effect.data)
			return null
		}
		case 'awaitBotTurn': {
			return host.scheduleBotTurn(
				effect.tribe,
				effect.difficulty,
				effect.gameState
			)
		}
		default: {
			const exhaustive: never = effect
			throw new Error(
				`runMatchCommand: unhandled MatchEffect ${JSON.stringify(exhaustive)}`
			)
		}
	}
}
