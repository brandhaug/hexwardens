import { constVoid } from 'effect/Function'
import { type Meta, type StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { tribes } from '@hexwardens/game-logic/domains/tribe'
import { type UnitType, type UnitId } from '@hexwardens/game-logic/domains/unit'
import { type GameState } from '@hexwardens/game-logic/game'
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

const BOARD_RADIUS = 3
const ALL_TRIBES = [...tribes]

const SHOWCASE_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 8.5, 10],
	cameraFov: 38,
	fogNear: 30,
	fogFar: 60,
	minDistance: 3.5,
	maxDistance: 60
}

function buildTribeGrid(
	unitType: UnitType,
	terrain: TileTerrain = 'grass'
): GameState {
	const board = createTestHexBoard(BOARD_RADIUS)
	if (terrain !== 'grass') {
		for (const row of board) {
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				const tile = row[q_idx]
				if (tile) {
					row[q_idx] = { ...tile, terrain }
				}
			}
		}
	}
	const unitStates: Record<UnitId, ReturnType<typeof createTestUnitState>> = {}
	ALL_TRIBES.forEach((tribe, idx) => {
		const pos: BoardPosition = {
			q_idx: (idx % 3) + 2,
			r_idx: Math.floor(idx / 3) + 1
		}
		if (!board[pos.r_idx]?.[pos.q_idx]) {
			return
		}
		const unit = createTestUnit(tribe, unitType)
		setUnitAt(board, pos, unit)
		unitStates[unit.id] = createTestUnitState(pos, unitType)
	})
	return createTestGameState({ units: { board, unitStates } })
}

function UnitTribeGrid({
	unitType,
	terrain = 'grass'
}: {
	unitType: UnitType
	terrain?: TileTerrain
}) {
	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(null)
	const gameState = buildTribeGrid(unitType, terrain)
	return (
		<Board
			gameState={gameState}
			currentPlayerTribe='barbarians'
			selectedTile={selectedTile}
			onTileSelect={setSelectedTile}
			onCombat={constVoid}
			onMovement={constVoid}
			revealAll
			sceneOverrides={SHOWCASE_OVERRIDES}
		/>
	)
}

const meta = {
	title: 'Game/Units',
	component: UnitTribeGrid,
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof UnitTribeGrid>

export default meta
type Story = StoryObj<typeof meta>

function storyForUnit(unitType: UnitType): Story {
	return { args: { unitType } }
}

export const Caveman = storyForUnit('caveman')
export const Archer = storyForUnit('archer')
export const Guard = storyForUnit('guard')
export const Spearman = storyForUnit('spearman')
export const Seer = storyForUnit('seer')
export const Sprinter = storyForUnit('sprinter')
export const Mage = storyForUnit('mage')
export const Swordsman = storyForUnit('swordsman')
export const Bombardier = storyForUnit('bombardier')
export const Tidebreaker = storyForUnit('tidebreaker')

/**
 * All units shift into the KayKit Medieval Hexagon ship when standing on
 * water/ocean tiles — mirrors the gameplay rule in
 * `getEffectiveUnitStatsForTerrain`. One caveman per tribe on a water board so
 * the tinted disc still identifies the team.
 */
export const ShipWater: Story = {
	args: { unitType: 'caveman', terrain: 'water' }
}
export const ShipOcean: Story = {
	args: { unitType: 'caveman', terrain: 'ocean' }
}
