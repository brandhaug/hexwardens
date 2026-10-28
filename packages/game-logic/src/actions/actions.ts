import { type Result } from 'effect'
import { type Hex } from 'honeycomb-grid'
import { type BoardPosition } from '../board/board'
import { type Tech } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { type UnitType } from '../domains/unit'
import { type VillagePerk } from '../domains/village'
import { type GameState } from '../game'
import { type TileState } from '../tile/tile'
import { type GameActionError } from './action-errors'
import { type GameWorld } from '../engine/world-contract'
import { type AllowedActionPlan } from './intent'

/** Feature-owned mutation of a validated command's private candidate world. */
export type WorldActionExecutor = (
	world: GameWorld,
	context: ActionContext,
	plan: AllowedActionPlan
) => string

/**
 * Vocabulary of player-issued tile actions. Public for UI rendering — the
 * action bar maps these strings to button labels and click handlers. The
 * Action Engine ({@link planAction} / {@link executePlan}) is the canonical
 * entry point; this string namespace exists for the round-trip between UI
 * and engine.
 */
export type SimpleActionType =
	| 'capture'
	| 'collect'
	| 'build'
	| 'heal'
	| 'explore'
	| 'retire'
	| 'recover'
	| 'upgrade-to-large'

export type TrainActionType = `train-${UnitType}`
export type ResearchActionType = `research-${Tech}`
export type SelectPerkActionType = `selectPerk-${VillagePerk}`

export type ActionType =
	| SimpleActionType
	| TrainActionType
	| ResearchActionType
	| SelectPerkActionType

export interface ActionOption {
	type: ActionType
	label: string
	variant:
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link'
}

/**
 * Per-tile context the engine assembles for plan/execute. Kept exported so
 * tests can stub one without going through the full engine round-trip.
 */
export interface ActionContext {
	gameState: GameState
	selectedTile: TileState
	selectedPosition: BoardPosition
	currentPlayerTribe: Tribe
	isWithinVillageRange: boolean
	gameHex: typeof Hex
	radius: number
}

export type ActionSuccess = {
	newGameState: GameState
	message: string
}

export type ActionResult = Result.Result<ActionSuccess, GameActionError>

/** Result of committing a planned tile action. */
export type ActionExecution = { state: GameState; message: string }
