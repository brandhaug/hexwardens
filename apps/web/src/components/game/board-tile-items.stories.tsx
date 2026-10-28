import { type Meta, type StoryObj } from '@storybook/react-vite'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { primaryBuildings } from '@hexwardens/game-logic/domains/primary-building'
import { resources } from '@hexwardens/game-logic/domains/resource'
import { secondaryBuildings } from '@hexwardens/game-logic/domains/secondary-building'
import { utilityBuildings } from '@hexwardens/game-logic/domains/utility-building'
import {
	createVillage,
	villageLevelConstants
} from '@hexwardens/game-logic/domains/village'
import {
	createTestGameState,
	createTestHexBoard
} from '@hexwardens/game-logic/test/game-test-helpers'
import {
	ALL_TRIBES,
	BOARD_RADIUS,
	BoardStory,
	emptyState,
	setItem,
	validHexPositions
} from './board-stories-shared'

const meta = {
	title: 'Game/Board/Tile Items',
	component: BoardStory,
	parameters: { layout: 'fullscreen' },
	argTypes: {
		currentPlayerTribe: {
			control: 'select',
			options: ALL_TRIBES
		},
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

export const AllPrimaryBuildings: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		primaryBuildings.forEach((value, idx) => {
			const pos: BoardPosition = { q_idx: 1 + idx, r_idx: BOARD_RADIUS }
			setItem(board, pos, {
				type: 'primaryBuilding',
				value,
				state: 'built',
				tribe: args.currentPlayerTribe
			})
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const AllSecondaryBuildings: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		secondaryBuildings.forEach((value, idx) => {
			const pos: BoardPosition = { q_idx: 1 + idx, r_idx: BOARD_RADIUS }
			setItem(board, pos, {
				type: 'secondaryBuilding',
				value,
				state: 'built',
				tribe: args.currentPlayerTribe
			})
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const AllUtilityBuildings: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		utilityBuildings.forEach((value, idx) => {
			const pos: BoardPosition = { q_idx: 2 + idx, r_idx: BOARD_RADIUS }
			setItem(board, pos, {
				type: 'utilityBuilding',
				value,
				state: 'built',
				tribe: args.currentPlayerTribe
			})
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const AllVillages: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		ALL_TRIBES.forEach((tribe, idx) => {
			const pos: BoardPosition = {
				q_idx: (idx % 3) + 2,
				r_idx: Math.floor(idx / 3) + 1
			}
			setItem(board, pos, {
				...createVillage(2),
				tribe,
				state: 'built'
			})
		})
		setItem(
			board,
			{ q_idx: 1, r_idx: BOARD_RADIUS },
			{
				...createVillage(3, 'capital'),
				tribe: args.currentPlayerTribe,
				level: 5,
				state: 'built'
			}
		)
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const UnclaimedVillages: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const levels = [1, 2, 3] as const
		levels.forEach((level, idx) => {
			const pos: BoardPosition = { q_idx: idx + 2, r_idx: BOARD_RADIUS }
			setItem(board, pos, {
				...createVillage(2),
				state: 'idle',
				level
			})
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const VillageLevels: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const levels = [1, 3, 5, 8, 10, 13] as const
		levels.forEach((level, idx) => {
			const pos: BoardPosition = { q_idx: idx + 1, r_idx: BOARD_RADIUS }
			const experienceToNextLevel =
				villageLevelConstants.experienceToNextLevel[level]
			setItem(board, pos, {
				...createVillage(2),
				tribe: args.currentPlayerTribe,
				state: 'built',
				level,
				experience: Math.ceil(experienceToNextLevel / 2),
				experienceToNextLevel
			})
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const AllResources: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const positions = validHexPositions(board)
		resources.forEach((value, idx) => {
			const pos = positions[idx]
			if (!pos) {
				return
			}
			setItem(board, pos, { type: 'resource', value })
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}
