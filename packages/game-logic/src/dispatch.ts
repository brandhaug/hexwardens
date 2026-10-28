import { Result } from 'effect'
import {
	InsufficientMoneyError,
	InvalidActionError,
	InvalidTargetError,
	PopulationFullError,
	TechRequirementError,
	UnitNotReadyError,
	GameOverError,
	NotYourTurnError,
	type GameActionError
} from './actions/action-errors'
import {
	availableActions as engineAvailableActions,
	createActionPlanner
} from './actions/engine'
import {
	type ActionDenialReason,
	type ActionIntent,
	type AllowedActionPlan
} from './actions/intent'
import { calculateBoardDimensions, type BoardPosition } from './board/board'
import { GameHex } from './board/hex-utils'
import { resolveWorldCombat } from './combat/resolve'
import { createGameWorld } from './engine/world'
import { type GameWorld } from './engine/world-contract'
import { moveWorldUnit } from './units/world-movement'
import { type CombatEvent } from './combat/types'
import { GAME_CONFIG } from './config'
import { type Tribe } from './domains/tribe'
import { mergeIncomingExploration, snapshotFor } from './fog-of-war/snapshot'
import { type GameState } from './game'
import { type ChronicleEntry } from './match/chronicle/chronicle-entry'
import { entriesFromCombatEvents } from './match/chronicle/entries-from-events'
import { sealWorldOutcome } from './match/outcome'
import { getPlayerState } from './player/player-state'
import { assertNever } from './type-utils'

export type Intent =
	| { kind: 'move'; from: BoardPosition; to: BoardPosition }
	| { kind: 'attack'; from: BoardPosition; to: BoardPosition }
	| { kind: 'tileAction'; action: ActionIntent }

/**
 * Effects emitted by {@link dispatch}. Effects are *executable*: the caller
 * must apply them (via {@link applyDispatchEffects}) to bring the returned
 * `nextState` to a fully-updated state. Splitting commitExploration out of
 * dispatch enables replay/rollback — tests or tooling can run a sequence of
 * intents and defer the exploration commit until the end.
 */
export type DispatchEffect = {
	t: 'commitExploration'
	tribe: Tribe
	tiles: readonly string[]
}

export interface DispatchSuccess {
	nextState: GameState
	message: string
	effects: readonly DispatchEffect[]
	combat?: { attacker: BoardPosition; defender: BoardPosition }
	/**
	 * Chronicle entries derived deterministically from the dispatched intent.
	 * Currently populated only from `attack` intents (kills); turn-pipeline
	 * events become entries via {@link entriesFromBroadcastEvents} at the
	 * `advanceTurn` boundary instead. Empty when nothing newsworthy happened.
	 */
	chronicleEntries: readonly ChronicleEntry[]
}

export function dispatch(
	state: GameState,
	tribe: Tribe,
	intent: Intent
): Result.Result<DispatchSuccess, GameActionError> {
	if (state.isGameOver) {
		return Result.fail(new GameOverError({ message: 'Game is over' }))
	}
	if (tribe !== state.currentPlayerTribe) {
		return Result.fail(new NotYourTurnError({ message: 'Not your turn' }))
	}

	const { radius } = getDimensions(state)
	const combatDescriptor: {
		attacker: BoardPosition
		defender: BoardPosition
	}[] = []
	const combatEventsCollector: CombatEvent[] = []

	const world = createGameWorld(state)
	const stepResult = runIntent(
		world,
		intent,
		radius,
		combatDescriptor,
		combatEventsCollector
	)
	if (Result.isFailure(stepResult)) {
		return Result.fail(stepResult.failure)
	}

	sealWorldOutcome(world)
	const nextState = world.snapshot()

	const previousExploration = playerExplorationKeys(state, tribe)
	const snapshot = snapshotFor(nextState, tribe)
	const newlyExplored: string[] = []
	for (const key of snapshot.visibleTileIds) {
		if (!previousExploration.has(key)) {
			newlyExplored.push(key)
		}
	}

	const chronicleEntries =
		combatEventsCollector.length > 0
			? entriesFromCombatEvents(combatEventsCollector, state, tribe, state.turn)
			: []

	const success: DispatchSuccess = {
		nextState,
		message: stepResult.success,
		effects: [{ t: 'commitExploration', tribe, tiles: newlyExplored }],
		chronicleEntries
	}
	const combat = combatDescriptor[0]
	if (combat) {
		success.combat = combat
	}
	return Result.succeed(success)
}

export function applyDispatchEffects(
	state: GameState,
	effects: readonly DispatchEffect[]
): GameState {
	let next = state
	for (const effect of effects) {
		next = mergeIncomingExploration(next, {
			tribe: effect.tribe,
			tiles: effect.tiles
		})
	}
	return next
}

/**
 * UI gating helper over the engine's allowed action plans.
 */
export function availableActions(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition
): AllowedActionPlan[] {
	return engineAvailableActions(state, tribe, at)
}

function runIntent(
	world: GameWorld,
	intent: Intent,
	radius: number,
	combatDescriptor: { attacker: BoardPosition; defender: BoardPosition }[],
	combatEvents: CombatEvent[]
): Result.Result<string, GameActionError> {
	switch (intent.kind) {
		case 'move': {
			return moveWorldUnit(world, intent.from, intent.to)
		}
		case 'attack': {
			const result = resolveWorldCombat(world, {
				from: intent.from,
				to: intent.to,
				grid: { gameHex: GameHex, radius }
			})
			if (Result.isSuccess(result)) {
				combatDescriptor.push({ attacker: intent.from, defender: intent.to })
				combatEvents.push(...result.success.events)
			}
			if (Result.isFailure(result)) {
				return Result.fail(result.failure)
			}
			return Result.succeed(result.success.message)
		}
		case 'tileAction': {
			const state = world.snapshot()
			// One planner per operation: plan + execute share a single context
			// derivation (tile lookup, Board, Tribe territory, radius).
			const planner = createActionPlanner(
				state,
				state.currentPlayerTribe,
				intent.action.at
			)
			const plan = planner.plan(intent.action)
			if (plan.kind === 'denied') {
				return Result.fail(denialToError(plan.reason))
			}
			return Result.succeed(planner.executeIn(world, plan))
		}
		default: {
			return assertNever(intent)
		}
	}
}

function denialToError(reason: ActionDenialReason): GameActionError {
	switch (reason.kind) {
		case 'invalidIntent': {
			return new InvalidActionError({ message: reason.detail })
		}
		case 'invalidTarget': {
			return new InvalidTargetError({ message: reason.detail })
		}
		case 'unitNotReady': {
			return new UnitNotReadyError({ message: reason.detail })
		}
		case 'insufficientFunds': {
			return new InsufficientMoneyError({
				cost: reason.required,
				message: `Not enough money (cost: ${reason.required})`
			})
		}
		case 'missingTech': {
			return new TechRequirementError({
				tech: reason.tech,
				message: `Requires ${reason.tech} tech`
			})
		}
		case 'populationFull': {
			return new PopulationFullError({ message: reason.detail })
		}
		case 'researchInProgress': {
			return new InvalidActionError({ message: 'Research already in progress' })
		}
		case 'noActionAvailable': {
			return new InvalidActionError({ message: reason.detail })
		}
		default: {
			return assertNever(reason)
		}
	}
}

function getDimensions(state: GameState) {
	return calculateBoardDimensions(
		state.units.board.length,
		GAME_CONFIG.TILE_SIZE,
		GAME_CONFIG.TILE_SPACING
	)
}

function playerExplorationKeys(state: GameState, tribe: Tribe): Set<string> {
	const player = getPlayerState(state.playerStates, tribe)
	return new Set(Object.keys(player?.exploration ?? {}))
}
