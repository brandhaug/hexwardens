import { positionKey } from '@hexwardens/game-logic/board/board'
import {
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
import { deriveBoardRenderData } from './board-render-data'

describe('deriveBoardRenderData', () => {
	it('keeps hidden tiles as generic fog entries without tile data', () => {
		const board = createTestBoard(2)
		const ownUnit = createTestUnit('barbarians', 'caveman', 'unit_own')
		const hiddenEnemy = createTestUnit('rogues', 'caveman', 'unit_enemy')
		const ownPosition = { q_idx: 2, r_idx: 2 }
		const hiddenPosition = { q_idx: 4, r_idx: 4 }
		setUnitAt(board, ownPosition, ownUnit)
		setUnitAt(board, hiddenPosition, hiddenEnemy)

		const gameState = createTestGameState({
			board,
			unitStates: {
				[ownUnit.id]: createTestUnitState(ownPosition, 'caveman'),
				[hiddenEnemy.id]: createTestUnitState(hiddenPosition, 'caveman')
			}
		})

		const renderData = deriveBoardRenderData({
			gameState,
			currentPlayerTribe: 'barbarians',
			selectedTile: null
		})

		const visibleEntry = renderData.entries.find(
			(entry) =>
				entry.position.q_idx === ownPosition.q_idx &&
				entry.position.r_idx === ownPosition.r_idx
		)
		const hiddenEntry = renderData.entries.find(
			(entry) =>
				entry.position.q_idx === hiddenPosition.q_idx &&
				entry.position.r_idx === hiddenPosition.r_idx
		)

		expect(visibleEntry?.kind).toBe('tile')
		expect(hiddenEntry).toEqual({
			kind: 'fog',
			position: hiddenPosition,
			worldPosition: expect.any(Array)
		})
		expect(hiddenEntry).not.toHaveProperty('tile')
		expect(hiddenEntry).not.toHaveProperty('terrain')
		expect(hiddenEntry).not.toHaveProperty('item')
		expect(hiddenEntry).not.toHaveProperty('unit')
	})

	it('renders explored-but-not-currently-visible tiles identically to visible tiles', () => {
		const board = createTestBoard(2)
		const ownUnit = createTestUnit('barbarians', 'caveman', 'unit_own')
		const hiddenEnemy = createTestUnit('rogues', 'caveman', 'unit_enemy')
		const ownPosition = { q_idx: 2, r_idx: 2 }
		const exploredPosition = { q_idx: 4, r_idx: 4 }
		setUnitAt(board, ownPosition, ownUnit)
		setUnitAt(board, exploredPosition, hiddenEnemy)

		const baseState = createTestGameState({
			board,
			unitStates: {
				[ownUnit.id]: createTestUnitState(ownPosition, 'caveman'),
				[hiddenEnemy.id]: createTestUnitState(exploredPosition, 'caveman')
			}
		})
		const ownPlayer = baseState.playerStates['barbarians']
		if (!ownPlayer) {
			throw new Error('expected own player state')
		}
		const gameState = {
			...baseState,
			playerStates: {
				...baseState.playerStates,
				barbarians: {
					...ownPlayer,
					exploration: { [positionKey(exploredPosition)]: true as const }
				}
			}
		}

		const renderData = deriveBoardRenderData({
			gameState,
			currentPlayerTribe: 'barbarians',
			selectedTile: null
		})

		const exploredEntry = renderData.entries.find(
			(entry) =>
				entry.position.q_idx === exploredPosition.q_idx &&
				entry.position.r_idx === exploredPosition.r_idx
		)

		expect(exploredEntry?.kind).toBe('tile')
		if (exploredEntry?.kind !== 'tile') {
			return
		}
		expect(exploredEntry.tile.terrain).toBe('grass')
		expect(exploredEntry.tile.unit).toBe(hiddenEnemy)
	})
})
