import { type BoardPosition } from '@hexwardens/game-logic/board/board.ts'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'

/**
 * In-place onboarding steps for the first match. Each step has:
 * - an `id` (stable, used for keys / persistence)
 * - an `anchor` describing where the prompt should attach
 * - copy fields the UI renders verbatim
 *
 * The controller derives the current step from authoritative game state plus a
 * couple of UI signals (selection, committed-action counts). When all relevant
 * actions for the first turn have been taken, the controller returns `null`.
 */

export type OnboardingAnchor =
	| { kind: 'tile'; position: BoardPosition }
	| { kind: 'action-bar' }
	| { kind: 'end-turn' }

export type OnboardingStepId = 'select-capital' | 'move-unit' | 'end-turn'

export interface OnboardingStep {
	id: OnboardingStepId
	title: string
	body: string
	anchor: OnboardingAnchor
	keyboardHint?: string
}

export interface OnboardingSignals {
	gameState: GameState
	playerTribe: Tribe
	selectedTile: BoardPosition | null
	hasMovedUnitThisTurn: boolean
	hasSelectedVillage?: boolean
	isReplay?: boolean
}

/**
 * Locate the player's first capital village on the board. Returns `null`
 * if the capital cannot be found (e.g. lost, fog-of-war hides it, etc.) —
 * the caller should treat that as "no anchor available" and either skip the
 * step or fall back to a generic prompt.
 */
export function findCapitalPosition(
	gameState: GameState,
	tribe: Tribe
): BoardPosition | null {
	const board = gameState.units.board
	for (const [r, row] of board.entries()) {
		for (const [q, tile] of row.entries()) {
			if (
				tile?.item?.type === 'village' &&
				tile.item.kind === 'capital' &&
				tile.item.tribe === tribe
			) {
				return { q_idx: q, r_idx: r }
			}
		}
	}
	return null
}

function isOwnVillageSelected(
	gameState: GameState,
	tribe: Tribe,
	selectedTile: BoardPosition | null
): boolean {
	if (!selectedTile) {
		return false
	}
	const tile = gameState.units.board[selectedTile.r_idx]?.[selectedTile.q_idx]
	return tile?.item?.type === 'village' && tile.item.tribe === tribe
}

/**
 * Derive the active onboarding step for the player. Returns `null` once all
 * first-turn lessons have been completed (or when the game has ended).
 *
 * Steps are evaluated in order — the first step whose completion predicate is
 * still false becomes the active step.
 */
export function deriveOnboardingStep(
	signals: OnboardingSignals
): OnboardingStep | null {
	const { gameState, playerTribe, selectedTile, hasMovedUnitThisTurn } = signals

	if (gameState.isGameOver) {
		return null
	}
	// Only run onboarding on the player's own first turn. Later turns are
	// either a returning player (handled by completion flag) or active play.
	if (gameState.turn > 1 && !signals.isReplay) {
		return null
	}
	if (gameState.currentPlayerTribe !== playerTribe) {
		return null
	}

	const capital = findCapitalPosition(gameState, playerTribe)

	const ownVillageSelected = isOwnVillageSelected(
		gameState,
		playerTribe,
		selectedTile
	)

	// Step 1 — select the capital. Completes once any of the player's own
	// villages is selected (the player may pick a non-capital tile but we still
	// advance — the lesson is "select a tile"). Anchor: capital tile. If we
	// can't locate the capital (lost, hidden), skip ahead to the next step.
	if (!ownVillageSelected && !signals.hasSelectedVillage && capital) {
		return {
			id: 'select-capital',
			title: 'Welcome to Hexwardens',
			body: 'Tap your highlighted Village to see what it can do.',
			anchor: { kind: 'tile', position: capital }
		}
	}

	// Step 2 — move a unit. Completes when any of the player's units has moved
	// this turn. Anchor: action bar (where the unit's actions surface) — the
	// player still needs to select a unit first, so the prompt copy directs
	// them.
	if (!hasMovedUnitThisTurn) {
		return {
			id: 'move-unit',
			title: 'Move a Unit',
			body: 'Select one of your Units, then tap a nearby tile to move. Units explore, capture, and attack.',
			anchor: { kind: 'action-bar' }
		}
	}

	// Step 3 — end the turn. Completes by leaving the turn-1 active state, at
	// which point the controller short-circuits at the top of this function
	// (turn > 1 or different `currentPlayerTribe`).
	return {
		id: 'end-turn',
		title: 'End your Turn',
		body: 'When you’re done, end your turn so opponents can take theirs.',
		anchor: { kind: 'end-turn' },
		keyboardHint: 'Space'
	}
}

/**
 * Recognizes explicit movement modes without treating new spent recruits as
 * moved. Persisted lesson progress records accepted movement separately, since
 * an acted unit's mode cannot establish whether it moved earlier.
 */
export function hasMovedAnyUnitThisTurn(
	gameState: GameState,
	tribe: Tribe
): boolean {
	const board = gameState.units.board
	const states = gameState.units.unitStates
	for (const row of board) {
		for (const tile of row) {
			if (!tile?.unit || tile.unit.tribe !== tribe) {
				continue
			}
			const state = states[tile.unit.id]
			if (!state) {
				continue
			}
			if (state.mode === 'moved' || state.mode === 'retreat') {
				return true
			}
		}
	}
	return false
}
