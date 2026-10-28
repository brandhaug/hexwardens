import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from './test/game-test-helpers'
import { Result } from 'effect'
import { assert } from 'vite-plus/test'
import { applyDispatchEffects, availableActions, dispatch } from './dispatch'
import { commitExploration, snapshotFor } from './fog-of-war/snapshot'
import { type GameState } from './game'
import { editPlayer } from './player/player-state'
import { typedKeys } from './type-utils'
import { type UnitStateRecord } from './unit-state-utils'

function initializeExploration(state: GameState): GameState {
	let next = state
	for (const tribe of typedKeys(next.playerStates)) {
		next = commitExploration(snapshotFor(next, tribe))
	}
	return next
}

function stateWithOwnVillage(overrides?: {
	tribe?: 'barbarians' | 'rogues'
	currentPlayerTribe?: 'barbarians' | 'rogues'
}) {
	const tribe = overrides?.tribe ?? 'barbarians'
	const radius = 2
	const board = createTestBoard(radius)
	const villagePos = { q_idx: 2, r_idx: 2 }

	const village = createTestVillage(tribe)
	requireTestValue(board[villagePos.r_idx])[villagePos.q_idx] = {
		...requireTestValue(
			requireTestValue(board[villagePos.r_idx])[villagePos.q_idx]
		),
		item: village
	}

	const base = createTestGameState({
		board,
		currentPlayerTribe: overrides?.currentPlayerTribe ?? tribe
	})
	const gameState = initializeExploration(base)
	return { gameState, villagePos }
}

describe('dispatch — pre-dispatch rule violations', () => {
	it('returns NotYourTurnError when a non-current tribe tries to act', () => {
		const { gameState, villagePos } = stateWithOwnVillage({
			currentPlayerTribe: 'barbarians'
		})

		const result = dispatch(gameState, 'rogues', {
			kind: 'tileAction',
			action: { kind: 'research', tech: 'climbing', at: villagePos }
		})

		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('NotYourTurnError')
	})

	it('returns GameOverError when the game has already ended', () => {
		const { gameState, villagePos } = stateWithOwnVillage()
		const endedState = {
			...gameState,
			isGameOver: true,
			winner: 'barbarians' as const
		}

		const result = dispatch(endedState, 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'research', tech: 'climbing', at: villagePos }
		})

		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('GameOverError')
	})

	it('returns InvalidTargetError for a tileAction on a missing tile', () => {
		const { gameState } = stateWithOwnVillage()

		const result = dispatch(gameState, 'barbarians', {
			kind: 'tileAction',
			action: {
				kind: 'research',
				tech: 'climbing',
				at: { q_idx: 99, r_idx: 99 }
			}
		})

		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})
})

describe('dispatch — tileAction intent', () => {
	it('executes research and updates player state immutably', () => {
		const { gameState, villagePos } = stateWithOwnVillage()
		const funded = {
			...gameState,
			playerStates: editPlayer(
				gameState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}

		const result = dispatch(funded, 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'research', tech: 'climbing', at: villagePos }
		})

		expect(Result.isSuccess(result)).toBe(true)
		assert(Result.isSuccess(result))
		expect(
			requireTestValue(result.success.nextState.playerStates['barbarians'])
				.researchedTechs
		).toContain('climbing')
		// Input state must not have been mutated.
		expect(result.success.nextState).not.toBe(funded)
		expect(
			requireTestValue(funded.playerStates['barbarians']).researchedTechs
		).not.toContain('climbing')
	})
})

describe('dispatch — move intent', () => {
	it('moves a unit and reports newly explored tiles', () => {
		const radius = 2
		const board = createTestBoard(radius)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const target = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(unitPos, 'caveman')
		}
		const baseState = createTestGameState({ board, unitStates })
		const gameState = initializeExploration(baseState)

		const result = dispatch(gameState, 'barbarians', {
			kind: 'move',
			from: unitPos,
			to: target
		})

		expect(Result.isSuccess(result)).toBe(true)
		assert(Result.isSuccess(result))
		const { nextState, effects } = result.success
		expect(
			requireTestValue(nextState.units.board[target.r_idx])[target.q_idx]?.unit
				?.id
		).toBe(unit.id)
		const commit = effects[0]
		expect(commit).toBeDefined()
		assert(commit !== undefined)
		expect(commit.tiles.length).toBeGreaterThan(0)
		// nextState has NOT yet applied exploration — caller must opt in.
		const beforeExploration = Object.keys(
			requireTestValue(nextState.playerStates['barbarians']).exploration
		)
		const applied = applyDispatchEffects(nextState, effects)
		const afterExploration = Object.keys(
			requireTestValue(applied.playerStates['barbarians']).exploration
		)
		expect(afterExploration.length).toBeGreaterThan(beforeExploration.length)
	})

	it('defers exploration so effects can be replayed or skipped', () => {
		const radius = 2
		const board = createTestBoard(radius)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const target = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(unitPos, 'caveman')
		}
		const baseState = createTestGameState({ board, unitStates })
		const gameState = initializeExploration(baseState)

		const result = dispatch(gameState, 'barbarians', {
			kind: 'move',
			from: unitPos,
			to: target
		})
		assert(Result.isSuccess(result))
		const exploredBefore = new Set(
			Object.keys(
				requireTestValue(gameState.playerStates['barbarians']).exploration
			)
		)
		// Skipping the commit effect keeps pre-move exploration.
		const withoutCommit = result.success.nextState
		expect(
			new Set(
				Object.keys(
					requireTestValue(withoutCommit.playerStates['barbarians']).exploration
				)
			)
		).toEqual(exploredBefore)

		// Applying effects twice is idempotent — replay-safe.
		const once = applyDispatchEffects(
			result.success.nextState,
			result.success.effects
		)
		const twice = applyDispatchEffects(once, result.success.effects)
		expect(
			Object.keys(
				requireTestValue(twice.playerStates['barbarians']).exploration
			).toSorted()
		).toEqual(
			Object.keys(
				requireTestValue(once.playerStates['barbarians']).exploration
			).toSorted()
		)
	})
})

describe('dispatch — attack intent', () => {
	it('reports a combat effect when attack succeeds', () => {
		const radius = 2
		const board = createTestBoard(radius)
		const attackerPos = { q_idx: 2, r_idx: 2 }
		const defenderPos = { q_idx: 3, r_idx: 2 }
		const attacker = createTestUnit('barbarians', 'caveman')
		const defender = createTestUnit('rogues', 'caveman')
		requireTestValue(board[attackerPos.r_idx])[attackerPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[attackerPos.r_idx])[attackerPos.q_idx]
			),
			unit: attacker
		}
		requireTestValue(board[defenderPos.r_idx])[defenderPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[defenderPos.r_idx])[defenderPos.q_idx]
			),
			unit: defender
		}
		const unitStates: UnitStateRecord = {
			[attacker.id]: createTestUnitState(attackerPos, 'caveman'),
			[defender.id]: createTestUnitState(defenderPos, 'caveman')
		}
		const baseState = createTestGameState({ board, unitStates })
		const gameState = initializeExploration(baseState)

		const result = dispatch(gameState, 'barbarians', {
			kind: 'attack',
			from: attackerPos,
			to: defenderPos
		})

		expect(Result.isSuccess(result)).toBe(true)
		assert(Result.isSuccess(result))
		expect(result.success.combat).toEqual({
			attacker: attackerPos,
			defender: defenderPos
		})
	})
})

describe('availableActions', () => {
	it('returns research options at own village (union of handler outputs)', () => {
		const { gameState, villagePos } = stateWithOwnVillage()
		const actions = availableActions(gameState, 'barbarians', villagePos)

		const types = actions.map((a) => a.preview.actionType)
		expect(types).toContain('research-climbing')
		expect(types).toContain('research-clam_harvesting')
		expect(types).toContain('research-fruit_harvesting')
	})

	it('returns empty for a tile outside the board', () => {
		const { gameState } = stateWithOwnVillage()
		const actions = availableActions(gameState, 'barbarians', {
			q_idx: 99,
			r_idx: 99
		})
		expect(actions).toEqual([])
	})
})
