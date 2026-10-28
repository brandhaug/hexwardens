import { type BoardPosition } from '../board/board'
import { type Tech } from '../domains/tech'
import { type UnitType } from '../domains/unit'
import { type VillagePerk } from '../domains/village'
import { type ActionType } from './actions'

/**
 * Player-facing description of "what the player wants to do at a tile".
 * Intents carry no tribe: the acting/previewing Tribe is an explicit
 * parameter of the engine interface (`createActionPlanner(state, tribe, at)`);
 * the one-shot wrappers default it to `state.currentPlayerTribe`.
 *
 * One intent kind per feature (build, capture, collect, explore, heal,
 * train, research). Move and attack are NOT actions — they're routed by
 * `dispatch.ts` directly to `executeMovement` / `resolveCombat`.
 */
export type ActionIntent =
	| { kind: 'build'; at: BoardPosition }
	| { kind: 'capture'; at: BoardPosition }
	| { kind: 'collect'; at: BoardPosition }
	| { kind: 'explore'; at: BoardPosition }
	| { kind: 'heal'; at: BoardPosition }
	| { kind: 'recover'; at: BoardPosition }
	| { kind: 'retire'; at: BoardPosition }
	| { kind: 'upgrade-to-large'; at: BoardPosition }
	| { kind: 'train'; at: BoardPosition; unit: UnitType }
	| { kind: 'research'; at: BoardPosition; tech: Tech }
	| { kind: 'selectPerk'; at: BoardPosition; perk: VillagePerk }

/** A feature-owned relevant command, including commands that may be denied. */
export interface ActionInspection {
	readonly intent: ActionIntent
	readonly label: string
	readonly outcome: string
}

/**
 * Discriminated denial reason. Every reason carries a stable kind so callers
 * can branch without parsing message strings; messages are only for UX.
 */
export type ActionDenialReason =
	| { kind: 'invalidIntent'; detail: string }
	| { kind: 'invalidTarget'; detail: string }
	| { kind: 'unitNotReady'; detail: string }
	| { kind: 'insufficientFunds'; required: number; available: number }
	| { kind: 'missingTech'; tech: Tech }
	| { kind: 'populationFull'; detail: string }
	| { kind: 'researchInProgress' }
	| { kind: 'noActionAvailable'; detail: string }

/**
 * Optional numeric cost the engine charges if the plan executes. Train, build,
 * collect, heal, and research all have a single gold cost; capture and explore
 * currently have no gold cost.
 */
export interface ActionCost {
	gold: number
}

/**
 * Lightweight preview for UI gating. `actionType` is a stable display id for
 * keys/labels; execution uses the structured `intent`.
 */
export interface ActionPreview {
	actionType: ActionType
	intent: ActionIntent
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
 * A plan that has passed validation and is safe to execute. The engine
 * guarantees `executePlan` accepts only this shape — denied plans cannot be
 * passed to `executePlan` at the type level.
 */
export interface AllowedActionPlan {
	kind: 'allowed'
	intent: ActionIntent
	cost: ActionCost
	preview: ActionPreview
}

/**
 * Plan returned by `planAction`. Either an executable allowed plan or a typed
 * denial reason. UI gating uses the kind to enable/disable buttons; execution
 * paths assert allowed before applying.
 */
export type ActionPlan =
	| AllowedActionPlan
	| { kind: 'denied'; intent: ActionIntent; reason: ActionDenialReason }
