import {
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
import { type BoardPosition } from '@hexwardens/game-logic/board/board.ts'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	deriveOnboardingStep,
	findCapitalPosition,
	hasMovedAnyUnitThisTurn
} from './onboarding-step-controller'

function buildScenarioWithCapital() {
	const board = createTestBoard(2)
	const capital: BoardPosition = { q_idx: 2, r_idx: 2 }
	const row = board[capital.r_idx]
	const tile = row?.[capital.q_idx]
	if (!row || !tile) {
		throw new Error('expected tile at capital position')
	}
	row[capital.q_idx] = {
		...tile,
		item: createTestVillage('barbarians', { kind: 'capital' })
	}

	const unit = createTestUnit('barbarians', 'caveman')
	setUnitAt(board, capital, unit)

	const state = createTestGameState({
		board,
		unitStates: {
			[unit.id]: createTestUnitState(capital, 'caveman')
		},
		currentPlayerTribe: 'barbarians',
		turn: 1
	})

	return { state, capital }
}

test('findCapitalPosition returns the player capital tile', () => {
	const { state, capital } = buildScenarioWithCapital()
	expect(findCapitalPosition(state, 'barbarians')).toEqual(capital)
})

test('findCapitalPosition returns null when no capital is found', () => {
	const state = createTestGameState()
	expect(findCapitalPosition(state, 'barbarians')).toBeNull()
})

test('first step prompts to select the capital, anchored at the capital tile', () => {
	const { state, capital } = buildScenarioWithCapital()
	const step = deriveOnboardingStep({
		gameState: state,
		playerTribe: 'barbarians',
		selectedTile: null,
		hasMovedUnitThisTurn: false
	})
	expect(step?.id).toBe('select-capital')
	expect(step?.anchor).toEqual({ kind: 'tile', position: capital })
})

test('select-capital is skipped when the capital cannot be located', () => {
	const board = createTestBoard(2)
	const state = createTestGameState({ board, currentPlayerTribe: 'barbarians' })
	const step = deriveOnboardingStep({
		gameState: state,
		playerTribe: 'barbarians',
		selectedTile: null,
		hasMovedUnitThisTurn: false
	})
	expect(step?.id).not.toBe('select-capital')
})

test('selecting an opponent tile does not satisfy select-capital', () => {
	const { state } = buildScenarioWithCapital()
	const board = state.units.board.map((row) => [...row])
	const opponentPos: BoardPosition = { q_idx: 0, r_idx: 0 }
	const row = board[opponentPos.r_idx]
	const tile = row?.[opponentPos.q_idx]
	if (!row || !tile) {
		throw new Error('expected opponent tile')
	}
	row[opponentPos.q_idx] = {
		...tile,
		item: createTestVillage('rogues', { kind: 'regular' })
	}

	const step = deriveOnboardingStep({
		gameState: { ...state, units: { ...state.units, board } },
		playerTribe: 'barbarians',
		selectedTile: opponentPos,
		hasMovedUnitThisTurn: false
	})
	expect(step?.id).toBe('select-capital')
})

test('after selecting own village, prompts to move a unit', () => {
	const { state, capital } = buildScenarioWithCapital()
	const step = deriveOnboardingStep({
		gameState: state,
		playerTribe: 'barbarians',
		selectedTile: capital,
		hasMovedUnitThisTurn: false
	})
	expect(step?.id).toBe('move-unit')
	expect(step?.anchor).toEqual({ kind: 'action-bar' })
})

test('after moving a unit, prompts to end the turn anchored at end-turn', () => {
	const { state, capital } = buildScenarioWithCapital()
	const step = deriveOnboardingStep({
		gameState: state,
		playerTribe: 'barbarians',
		selectedTile: capital,
		hasMovedUnitThisTurn: true
	})
	expect(step?.id).toBe('end-turn')
	expect(step?.anchor).toEqual({ kind: 'end-turn' })
})

test('end-turn step exposes a Space keyboard hint', () => {
	const { state, capital } = buildScenarioWithCapital()
	const step = deriveOnboardingStep({
		gameState: state,
		playerTribe: 'barbarians',
		selectedTile: capital,
		hasMovedUnitThisTurn: true
	})
	expect(step?.keyboardHint).toBe('Space')
})

test('returns null once the player has rolled past turn 1', () => {
	const { state, capital } = buildScenarioWithCapital()
	const turn2: GameState = { ...state, turn: 2 }
	const step = deriveOnboardingStep({
		gameState: turn2,
		playerTribe: 'barbarians',
		selectedTile: capital,
		hasMovedUnitThisTurn: false
	})
	expect(step).toBeNull()
})

test('returns null while the bot is acting (different currentPlayerTribe)', () => {
	const { state } = buildScenarioWithCapital()
	const botActive: GameState = { ...state, currentPlayerTribe: 'rogues' }
	const step = deriveOnboardingStep({
		gameState: botActive,
		playerTribe: 'barbarians',
		selectedTile: null,
		hasMovedUnitThisTurn: false
	})
	expect(step).toBeNull()
})

test('returns null when the game is over', () => {
	const { state } = buildScenarioWithCapital()
	const over: GameState = { ...state, isGameOver: true, winner: 'barbarians' }
	const step = deriveOnboardingStep({
		gameState: over,
		playerTribe: 'barbarians',
		selectedTile: null,
		hasMovedUnitThisTurn: false
	})
	expect(step).toBeNull()
})

test('hasMovedAnyUnitThisTurn returns false when all own units are ready', () => {
	const { state } = buildScenarioWithCapital()
	expect(hasMovedAnyUnitThisTurn(state, 'barbarians')).toBe(false)
})

test('hasMovedAnyUnitThisTurn returns true once any own unit leaves ready', () => {
	const { state, capital } = buildScenarioWithCapital()
	const tile = state.units.board[capital.r_idx]?.[capital.q_idx]
	if (!tile?.unit) {
		throw new Error('expected unit on capital')
	}
	const unitState = state.units.unitStates[tile.unit.id]
	if (unitState === undefined) {
		throw new Error('Expected capital unit state')
	}
	const movedStates = {
		...state.units.unitStates,
		[tile.unit.id]: {
			...unitState,
			mode: 'moved' as const
		}
	}
	const moved: GameState = {
		...state,
		units: { ...state.units, unitStates: movedStates }
	}
	expect(hasMovedAnyUnitThisTurn(moved, 'barbarians')).toBe(true)
})

test('hasMovedAnyUnitThisTurn ignores units belonging to other tribes', () => {
	const { state, capital } = buildScenarioWithCapital()
	const enemyPos: BoardPosition = { q_idx: 0, r_idx: 0 }
	const board = state.units.board.map((row) => [...row])
	const enemyUnit = createTestUnit('rogues', 'caveman')
	setUnitAt(board, enemyPos, enemyUnit)

	const enemyStates = {
		...state.units.unitStates,
		[enemyUnit.id]: createTestUnitState(enemyPos, 'caveman', { mode: 'moved' })
	}
	const next: GameState = {
		...state,
		units: { board, unitStates: enemyStates }
	}
	expect(hasMovedAnyUnitThisTurn(next, 'barbarians')).toBe(false)
	expect(capital).toBeDefined()
})

// Failure cases: selecting another tile regresses a completed lesson; a spent
// recruit counts as movement; replay cannot run after the opening turn.
test('keeps the selection lesson completed after deselection', () => {
	const { state } = buildScenarioWithCapital()
	expect(
		deriveOnboardingStep({
			gameState: state,
			playerTribe: 'barbarians',
			selectedTile: null,
			hasSelectedVillage: true,
			hasMovedUnitThisTurn: false
		})?.id
	).toBe('move-unit')
})

test('allows an explicitly replayed tutorial on a later turn', () => {
	const { state } = buildScenarioWithCapital()
	expect(
		deriveOnboardingStep({
			gameState: { ...state, turn: 5 },
			playerTribe: 'barbarians',
			selectedTile: null,
			hasMovedUnitThisTurn: false,
			isReplay: true
		})?.id
	).toBe('select-capital')
})

test('does not count a newly trained spent unit as movement', () => {
	const { state, capital } = buildScenarioWithCapital()
	const unit = state.units.board[capital.r_idx]?.[capital.q_idx]?.unit
	if (!unit) {
		throw new Error('Expected capital unit')
	}
	const unitState = state.units.unitStates[unit.id]
	if (!unitState) {
		throw new Error('Expected unit state')
	}
	expect(
		hasMovedAnyUnitThisTurn(
			{
				...state,
				units: {
					...state.units,
					unitStates: {
						...state.units.unitStates,
						[unit.id]: { ...unitState, mode: 'acted' }
					}
				}
			},
			'barbarians'
		)
	).toBe(false)
})
