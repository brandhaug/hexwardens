import { constVoid } from 'effect/Function'
import { useState } from 'react'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type ObstacleKind } from '@hexwardens/game-logic/domains/obstacle'
import { tribes, type Tribe } from '@hexwardens/game-logic/domains/tribe'

import { type UnitId, type UnitType } from '@hexwardens/game-logic/domains/unit'
import { createVillage } from '@hexwardens/game-logic/domains/village'
import { type GameState, type TileGrid } from '@hexwardens/game-logic/game'
import {
	createTestGameState,
	createTestHexBoard,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import { type BoardSceneOverrides } from './board-scene'
import { Board } from './board'

export const BOARD_RADIUS = 3
export const BOARD_SIZE = BOARD_RADIUS * 2 + 1
export const ALL_TRIBES = [...tribes]

export const SHOWCASE_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 8.5, 10],
	cameraFov: 38,
	fogNear: 30,
	fogFar: 60,
	minDistance: 3.5,
	maxDistance: 60
}

export const CLOSE_REVIEW_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 5.8, 7.1],
	cameraFov: 34,
	fogNear: 24,
	fogFar: 48,
	minDistance: 3,
	maxDistance: 36
}

export const TOP_DOWN_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 18, 6],
	cameraFov: 50,
	fogNear: 30,
	fogFar: 60,
	maxDistance: 60
}

export interface BoardStoryProps {
	gameState: GameState
	currentPlayerTribe: Tribe
	revealAll?: boolean | undefined
	overrides?: BoardSceneOverrides
}

export function BoardStory({
	gameState,
	currentPlayerTribe,
	revealAll = true,
	overrides = SHOWCASE_OVERRIDES
}: BoardStoryProps) {
	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(null)
	return (
		<Board
			gameState={gameState}
			currentPlayerTribe={currentPlayerTribe}
			selectedTile={selectedTile}
			onTileSelect={setSelectedTile}
			onCombat={constVoid}
			onMovement={constVoid}
			revealAll={revealAll}
			sceneOverrides={overrides}
		/>
	)
}

export function SelectedBoardStory({
	gameState,
	currentPlayerTribe,
	selected,
	revealAll = true,
	overrides = SHOWCASE_OVERRIDES
}: {
	gameState: GameState
	currentPlayerTribe: Tribe
	selected: BoardPosition
	revealAll?: boolean | undefined
	overrides?: BoardSceneOverrides
}) {
	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(
		selected
	)
	const [previousSelection, setPreviousSelection] = useState(selected)
	if (previousSelection !== selected) {
		setPreviousSelection(selected)
		setSelectedTile(selected)
	}
	return (
		<Board
			gameState={gameState}
			currentPlayerTribe={currentPlayerTribe}
			selectedTile={selectedTile}
			onTileSelect={setSelectedTile}
			onCombat={constVoid}
			onMovement={constVoid}
			revealAll={revealAll}
			sceneOverrides={overrides}
		/>
	)
}

export function setTerrain(
	board: Array<Array<TileGrid[number][number]>>,
	pos: BoardPosition,
	terrain: TileTerrain
): void {
	const row = board[pos.r_idx]
	const tile = row?.[pos.q_idx]
	if (!row || !tile) {
		return
	}
	row[pos.q_idx] = {
		...tile,
		terrain,
		isMountain: terrain === 'stone'
	}
}

export function setItem(
	board: Array<Array<TileGrid[number][number]>>,
	pos: BoardPosition,
	item: NonNullable<TileGrid[number][number]>['item']
): void {
	const row = board[pos.r_idx]
	const tile = row?.[pos.q_idx]
	if (!row || !tile) {
		return
	}
	row[pos.q_idx] = { ...tile, item }
}

export function setObstacle(
	board: Array<Array<TileGrid[number][number]>>,
	pos: BoardPosition,
	obstacle: ObstacleKind
): void {
	const row = board[pos.r_idx]
	const tile = row?.[pos.q_idx]
	if (!row || !tile) {
		return
	}
	row[pos.q_idx] = { ...tile, obstacle }
}

export function emptyState(): GameState {
	return createTestGameState({
		units: { board: createTestHexBoard(BOARD_RADIUS), unitStates: {} }
	})
}

export function validHexPositions(board: TileGrid): BoardPosition[] {
	const positions: BoardPosition[] = []
	for (let r_idx = 0; r_idx < board.length; r_idx++) {
		const row = board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			if (row[q_idx]) {
				positions.push({ q_idx, r_idx })
			}
		}
	}
	return positions
}

export function placeUnits(tribe: Tribe, unitTypes: readonly UnitType[]) {
	const board = createTestHexBoard(BOARD_RADIUS)
	const unitStates: Record<UnitId, ReturnType<typeof createTestUnitState>> = {}
	const positions = validHexPositions(board)
	const placement = positions.filter(
		(p) => p.r_idx >= 2 && p.r_idx <= BOARD_RADIUS + 1
	)
	unitTypes.forEach((type, idx) => {
		const pos = placement[idx]
		if (!pos) {
			return
		}
		const unit = createTestUnit(tribe, type)
		setUnitAt(board, pos, unit)
		unitStates[unit.id] = createTestUnitState(pos, type)
	})
	return { board, unitStates }
}

export function interactionScene(currentPlayerTribe: Tribe) {
	const board = createTestHexBoard(BOARD_RADIUS)
	const unitStates: Record<UnitId, ReturnType<typeof createTestUnitState>> = {}
	setItem(
		board,
		{ q_idx: BOARD_RADIUS, r_idx: BOARD_RADIUS },
		{ ...createVillage(2), tribe: currentPlayerTribe, state: 'built' }
	)
	const attackerPos: BoardPosition = {
		q_idx: BOARD_RADIUS - 1,
		r_idx: BOARD_RADIUS
	}
	const attacker = createTestUnit(currentPlayerTribe, 'sprinter')
	setUnitAt(board, attackerPos, attacker)
	unitStates[attacker.id] = createTestUnitState(attackerPos, 'sprinter')
	const targetPos: BoardPosition = {
		q_idx: BOARD_RADIUS - 1,
		r_idx: BOARD_RADIUS - 1
	}
	const defender = createTestUnit('orcs', 'caveman')
	setUnitAt(board, targetPos, defender)
	unitStates[defender.id] = createTestUnitState(targetPos, 'caveman')
	return { board, unitStates, attackerPos }
}
