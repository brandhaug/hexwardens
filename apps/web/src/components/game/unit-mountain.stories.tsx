import { type Meta, type StoryObj } from '@storybook/react-vite'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type UnitId, type UnitType } from '@hexwardens/game-logic/domains/unit'
import {
	createTestGameState,
	createTestHexBoard,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
import { type BoardSceneOverrides } from './board-scene'
import {
	ALL_TRIBES,
	BOARD_RADIUS,
	BoardStory,
	emptyState,
	setTerrain,
	validHexPositions
} from './board-stories-shared'

const SIDE_VIEW_OVERRIDES: BoardSceneOverrides = {
	cameraPosition: [0, 1.4, 6.5],
	cameraFov: 32,
	fogNear: 30,
	fogFar: 60,
	minDistance: 3,
	maxDistance: 36
}

const meta = {
	title: 'Game/Board/UnitMountain',
	component: BoardStory,
	parameters: { layout: 'fullscreen' },
	argTypes: {
		currentPlayerTribe: { control: 'select', options: ALL_TRIBES },
		revealAll: { control: 'boolean' }
	},
	args: {
		gameState: emptyState(),
		currentPlayerTribe: 'barbarians',
		revealAll: true
	}
} satisfies Meta<typeof BoardStory>

export default meta
type Story = StoryObj<typeof meta>

const CENTER: BoardPosition = { q_idx: BOARD_RADIUS, r_idx: BOARD_RADIUS }
const FLAT_NEIGHBOR: BoardPosition = {
	q_idx: BOARD_RADIUS + 1,
	r_idx: BOARD_RADIUS
}

function makeMountainShowcase(
	tribe: Tribe
): ReturnType<typeof createTestGameState> {
	const board = createTestHexBoard(BOARD_RADIUS)
	for (const pos of validHexPositions(board)) {
		setTerrain(board, pos, 'grass')
	}

	const row = board[CENTER.r_idx]
	const centerTile = row?.[CENTER.q_idx]
	if (row && centerTile) {
		row[CENTER.q_idx] = { ...centerTile, isMountain: true }
	}

	const unitStates: Record<UnitId, ReturnType<typeof createTestUnitState>> = {}

	const mountainType: UnitType = 'swordsman'
	const mountainUnit = createTestUnit(tribe, mountainType)
	setUnitAt(board, CENTER, mountainUnit)
	unitStates[mountainUnit.id] = createTestUnitState(CENTER, mountainType)

	const flatType: UnitType = 'swordsman'
	const flatUnit = createTestUnit(tribe, flatType)
	setUnitAt(board, FLAT_NEIGHBOR, flatUnit)
	unitStates[flatUnit.id] = createTestUnitState(FLAT_NEIGHBOR, flatType)

	return createTestGameState({
		units: { board, unitStates },
		currentPlayerTribe: tribe
	})
}

export const UnitOnMountain: Story = {
	render: (args) => (
		<BoardStory
			gameState={makeMountainShowcase(args.currentPlayerTribe)}
			currentPlayerTribe={args.currentPlayerTribe}
			revealAll={args.revealAll}
			overrides={SIDE_VIEW_OVERRIDES}
		/>
	)
}

function makeMountainOnly(): ReturnType<typeof createTestGameState> {
	const board = createTestHexBoard(BOARD_RADIUS)
	for (const pos of validHexPositions(board)) {
		setTerrain(board, pos, 'grass')
	}

	const row = board[CENTER.r_idx]
	const centerTile = row?.[CENTER.q_idx]
	if (row && centerTile) {
		row[CENTER.q_idx] = { ...centerTile, isMountain: true }
	}

	return createTestGameState({
		units: { board, unitStates: {} },
		currentPlayerTribe: 'barbarians'
	})
}

export const MountainOnly: Story = {
	render: (args) => (
		<BoardStory
			gameState={makeMountainOnly()}
			currentPlayerTribe={args.currentPlayerTribe}
			revealAll={args.revealAll}
			overrides={SIDE_VIEW_OVERRIDES}
		/>
	)
}
