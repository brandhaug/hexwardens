import { constVoid } from 'effect/Function'
import { type Meta, type StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import {
	tribes,
	tribeToTerrain,
	tribeToTribeStats,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'

import {
	generalUnitTypes,
	type UnitId
} from '@hexwardens/game-logic/domains/unit'
import { createVillage } from '@hexwardens/game-logic/domains/village'
import { type GameState, type TileGrid } from '@hexwardens/game-logic/game'
import { createInitialPlayerStates } from '@hexwardens/game-logic/player/player-state'
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

const SHOWCASE_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 8.5, 10],
	cameraFov: 38,
	fogNear: 30,
	fogFar: 60,
	minDistance: 3.5,
	maxDistance: 60
}

function setItem(
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

function setTerrain(
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

function paintBackdrop(
	board: Array<Array<TileGrid[number][number]>>,
	terrain: TileTerrain
): void {
	for (let r_idx = 0; r_idx < board.length; r_idx++) {
		const row = board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			if (row[q_idx]) {
				setTerrain(board, { q_idx, r_idx }, terrain)
			}
		}
	}
}

// Two rows of 5 in the camera focus zone, hero front-and-centre, capital
// behind. Layout is hand-tuned for BOARD_RADIUS=3 — every position below is a
// valid hex tile in the radius-3 honeycomb.
const GENERAL_UNIT_POSITIONS: readonly BoardPosition[] = [
	{ q_idx: 1, r_idx: 2 },
	{ q_idx: 2, r_idx: 2 },
	{ q_idx: 3, r_idx: 2 },
	{ q_idx: 4, r_idx: 2 },
	{ q_idx: 5, r_idx: 2 },
	{ q_idx: 1, r_idx: 3 },
	{ q_idx: 2, r_idx: 3 },
	{ q_idx: 3, r_idx: 3 },
	{ q_idx: 4, r_idx: 3 },
	{ q_idx: 5, r_idx: 3 }
]
const HERO_POSITION: BoardPosition = { q_idx: 3, r_idx: 4 }
const CAPITAL_POSITION: BoardPosition = { q_idx: 3, r_idx: 1 }

function tribeRosterState(tribe: Tribe): GameState {
	const board = createTestHexBoard(BOARD_RADIUS)
	const terrain = tribeToTerrain[tribe]
	// Stone tiles flip `isMountain` and change traversal — skip the backdrop
	// paint for engineers so the unit miniatures stay readable.
	if (terrain !== 'stone') {
		paintBackdrop(board, terrain)
	}

	setItem(board, CAPITAL_POSITION, {
		...createVillage(3, 'capital'),
		tribe,
		level: 5,
		state: 'built'
	})

	const unitStates: Record<UnitId, ReturnType<typeof createTestUnitState>> = {}
	generalUnitTypes.forEach((type, idx) => {
		const pos = GENERAL_UNIT_POSITIONS[idx]
		if (!pos || !board[pos.r_idx]?.[pos.q_idx]) {
			return
		}
		const unit = createTestUnit(tribe, type)
		setUnitAt(board, pos, unit)
		unitStates[unit.id] = createTestUnitState(pos, type)
	})

	const heroType = tribeToTribeStats[tribe].heroUnit
	const hero = createTestUnit(tribe, heroType)
	setUnitAt(board, HERO_POSITION, hero)
	unitStates[hero.id] = createTestUnitState(HERO_POSITION, heroType)

	// `createTestGameState` seeds player states for barbarians + rogues only.
	// The Board reads the current player's state on render, so non-default
	// tribes must overwrite the record or `getCurrentPlayerState` throws.
	const playerStates = createInitialPlayerStates([
		{
			tribe,
			name: 'Showcase',
			money: 5,
			isBot: false,
			difficulty: 'Beginner'
		}
	])

	return createTestGameState({
		units: { board, unitStates },
		playerStates,
		currentPlayerTribe: tribe
	})
}

interface TribeRosterStoryProps {
	tribe: Tribe
}

function TribeRosterStory({ tribe }: TribeRosterStoryProps) {
	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(null)
	return (
		<Board
			gameState={tribeRosterState(tribe)}
			currentPlayerTribe={tribe}
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
	title: 'Game/Tribes',
	component: TribeRosterStory,
	parameters: { layout: 'fullscreen' },
	argTypes: {
		tribe: { control: 'select', options: [...tribes] }
	}
} satisfies Meta<typeof TribeRosterStory>

export default meta
type Story = StoryObj<typeof meta>

export const Barbarians: Story = { args: { tribe: 'barbarians' } }
export const Rogues: Story = { args: { tribe: 'rogues' } }
export const Druids: Story = { args: { tribe: 'druids' } }
export const Orcs: Story = { args: { tribe: 'orcs' } }
export const Wraiths: Story = { args: { tribe: 'wraiths' } }
export const Engineers: Story = { args: { tribe: 'engineers' } }
export const Templars: Story = { args: { tribe: 'templars' } }
export const Skeletons: Story = { args: { tribe: 'skeletons' } }
export const Frostkin: Story = { args: { tribe: 'frostkin' } }
