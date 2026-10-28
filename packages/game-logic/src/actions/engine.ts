import { actionAuthority } from './authority'
import { createGameWorld } from '../engine/world'
import { type GameWorld } from '../engine/world-contract'
import { Board, calculateBoardDimensions } from '../board/board'
import { type BoardPosition } from '../board/position'
import { getTribeVillageRange } from '../board/tribe-range'
import { GameHex } from '../board/hex-utils'
import { GAME_CONFIG } from '../config'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import {
	type ActionContext,
	type ActionOption,
	type ActionExecution
} from './actions'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type AllowedActionPlan
} from './intent'
import { actionFeatures, featureFor } from './registry'

/**
 * One planning/execution handle per `(GameState, Tribe, position)` operation.
 *
 * The planner derives the {@link ActionContext} (tile lookup, `Board`,
 * Tribe territory via `getTribeVillageRange`, hex radius) exactly once at
 * construction and serves every `plan` / `execute` / `availableActions`
 * call from that single derivation. Context derivation is owned here —
 * features receive the context, they never rebuild it.
 *
 * The acting/previewing `tribe` is an explicit constructor parameter: the
 * planner aligns `context.gameState.currentPlayerTribe` with it once at
 * construction, so callers never swap `currentPlayerTribe` on the state to
 * preview another Tribe's actions.
 */
export interface ActionPlanner {
	readonly tribe: Tribe
	readonly at: BoardPosition
	/** Validate one intent against the derived context. */
	plan(intent: ActionIntent): ActionPlan
	/** Apply an allowed plan. Denied plans are rejected at compile time. */
	execute(plan: AllowedActionPlan): ActionExecution
	executeIn(world: GameWorld, plan: AllowedActionPlan): string
	/** Every allowed plan at this tile for this tribe (UI gating query). */
	availableActions(): AllowedActionPlan[]
	/** Relevant feature-owned commands, retaining denied plans for inspection. */
	inspectActions(): { candidate: ActionInspection; plan: ActionPlan }[]
}

/**
 * Build an {@link ActionPlanner} for one operation. `tribe` is the acting
 * (or previewing) Tribe — pass `state.currentPlayerTribe` for normal play.
 * Construction is cheap relative to re-deriving per intent: the planner is
 * meant to be created fresh for every operation, never cached across state
 * mutations.
 */
export function createActionPlanner(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition
): ActionPlanner {
	// Features validate against `gameState.currentPlayerTribe` as
	// well as `context.currentPlayerTribe`; align the two once here so the
	// whole operation sees a consistent acting tribe.
	const contextState: GameState =
		tribe === state.currentPlayerTribe
			? state
			: { ...state, currentPlayerTribe: tribe }
	const context = buildContext(contextState, tribe, at)

	function planIntent(intent: ActionIntent): ActionPlan {
		if (!context) {
			return {
				kind: 'denied',
				intent,
				reason: { kind: 'invalidTarget', detail: 'No tile at position' }
			}
		}
		const reason = actionAuthority(intent, context)
		return reason
			? { kind: 'denied', intent, reason }
			: featureFor(intent.kind).plan(intent, context)
	}

	return {
		tribe,
		at,
		plan: planIntent,
		execute(plan) {
			if (!context) {
				return { state, message: 'No tile at position' }
			}
			const world = createGameWorld(context.gameState)
			const message = featureFor(plan.intent.kind).execute(world, context, plan)
			return { state: world.snapshot(), message }
		},
		executeIn(world, plan) {
			return context
				? featureFor(plan.intent.kind).execute(world, context, plan)
				: 'No tile at position'
		},
		inspectActions() {
			if (!context) {
				return []
			}
			const inspected: { candidate: ActionInspection; plan: ActionPlan }[] = []
			for (const feature of actionFeatures) {
				const candidate = feature.inspect?.(context)
				if (candidate) {
					inspected.push({ candidate, plan: planIntent(candidate.intent) })
				}
			}
			return inspected
		},
		availableActions() {
			if (!context) {
				return []
			}
			const allowed: AllowedActionPlan[] = []
			for (const feature of actionFeatures) {
				for (const preview of feature.preview(context)) {
					const reason = actionAuthority(preview.intent, context)
					if (reason) {
						continue
					}
					const plan = feature.plan(preview.intent, context)
					if (plan.kind === 'allowed') {
						allowed.push(plan)
					}
				}
			}
			return allowed
		}
	}
}

/**
 * Plan a player intent against the current state. Runs every validation
 * (target legality, cost, tech, population, ...) and returns either an
 * `allowed` plan carrying the cost + UI preview, or a typed denial reason.
 *
 * Convenience wrapper over {@link createActionPlanner} for the current
 * player. Callers that both plan and execute (or enumerate) should hold one
 * planner instead, so the context is derived once for the whole operation —
 * `dispatch.ts` does exactly that.
 */
export function planAction(state: GameState, intent: ActionIntent): ActionPlan {
	return createActionPlanner(state, state.currentPlayerTribe, intent.at).plan(
		intent
	)
}

/**
 * Apply an `allowed` plan to state. The parameter type is
 * {@link AllowedActionPlan} — denied plans are rejected at compile time.
 *
 * Pure: returns a new state and a UX message. Determinism comes from the
 * underlying handlers (no `Math.random`, seeded prando where needed).
 */
export function executePlan(
	state: GameState,
	plan: AllowedActionPlan
): ActionExecution {
	return createActionPlanner(
		state,
		state.currentPlayerTribe,
		plan.intent.at
	).execute(plan)
}

/**
 * Enumerate every allowed action plan available at the given tile for the
 * given tribe. Every returned plan is guaranteed to pass {@link planAction}
 * — this is the canonical "what buttons should I show" query for UI gating.
 *
 * `tribe` is explicit: pass a non-current Tribe to preview its actions. The
 * planner derives the context once for the whole enumeration.
 */
export function availableActions(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition
): AllowedActionPlan[] {
	return createActionPlanner(state, tribe, at).availableActions()
}

export function plansToOptions(plans: AllowedActionPlan[]): ActionOption[] {
	return plans.map((plan) => ({
		type: plan.preview.actionType,
		label: plan.preview.label,
		variant: plan.preview.variant
	}))
}

function buildContext(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition
): ActionContext | null {
	const tile = state.units.board[at.r_idx]?.[at.q_idx]
	if (!tile) {
		return null
	}
	const board = Board.from(state.units.board)
	const territory = getTribeVillageRange(state.units.board, tribe)
	const { radius } = calculateBoardDimensions(
		state.units.board.length,
		GAME_CONFIG.TILE_SIZE,
		GAME_CONFIG.TILE_SPACING
	)
	return {
		gameState: state,
		selectedTile: tile,
		selectedPosition: at,
		currentPlayerTribe: tribe,
		isWithinVillageRange: territory.has(board.key(at)),
		gameHex: GameHex,
		radius
	}
}
