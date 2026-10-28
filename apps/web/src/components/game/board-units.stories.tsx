import { type Meta, type StoryObj } from '@storybook/react-vite'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import {
	tribeToTribeStats,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'

import {
	generalUnitTypes,
	heroUnitTypes,
	type UnitId,
	type UnitType
} from '@hexwardens/game-logic/domains/unit'
import {
	createTestGameState,
	createTestHexBoard,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
import {
	ALL_TRIBES,
	BOARD_RADIUS,
	BoardStory,
	CLOSE_REVIEW_OVERRIDES,
	emptyState,
	placeUnits
} from './board-stories-shared'

const meta = {
	title: 'Game/Board/Units',
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

export const AllUnits: Story = {
	render: (args) => {
		const { board, unitStates } = placeUnits(
			args.currentPlayerTribe,
			generalUnitTypes
		)
		const state = createTestGameState({ units: { board, unitStates } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const AllHeroes: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const unitStates: Record<
			UnitId,
			ReturnType<typeof createTestUnitState>
		> = {}
		heroUnitTypes.forEach((heroType, idx) => {
			const owningTribe = ALL_TRIBES.find(
				(t) => tribeToTribeStats[t].heroUnit === heroType
			)
			if (!owningTribe) {
				return
			}
			const pos: BoardPosition = {
				q_idx: (idx % 3) + 2,
				r_idx: Math.floor(idx / 3) + 1
			}
			const unit = createTestUnit(owningTribe, heroType)
			setUnitAt(board, pos, unit)
			unitStates[unit.id] = createTestUnitState(pos, heroType)
		})
		const state = createTestGameState({ units: { board, unitStates } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const DamagedUnits: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const unitStates: Record<
			UnitId,
			ReturnType<typeof createTestUnitState>
		> = {}
		const setups: readonly {
			readonly tribe: Tribe
			readonly type: UnitType
			readonly pos: BoardPosition
			readonly health: number
			readonly mode?: 'ready' | 'moved' | 'acted'
		}[] = [
			{
				tribe: args.currentPlayerTribe,
				type: 'caveman',
				pos: { q_idx: 2, r_idx: 2 },
				health: 3
			},
			{
				tribe: args.currentPlayerTribe,
				type: 'archer',
				pos: { q_idx: 3, r_idx: 2 },
				health: 8,
				mode: 'moved'
			},
			{
				tribe: 'orcs',
				type: 'sprinter',
				pos: { q_idx: 4, r_idx: 2 },
				health: 5,
				mode: 'acted'
			},
			{
				tribe: 'rogues',
				type: 'seer',
				pos: { q_idx: 3, r_idx: 3 },
				health: 1
			}
		]
		setups.forEach((setup) => {
			const unit = createTestUnit(setup.tribe, setup.type)
			setUnitAt(board, setup.pos, unit)
			unitStates[unit.id] = createTestUnitState(setup.pos, setup.type, {
				health: setup.health,
				mode: setup.mode ?? 'ready',
				hasBeenAttackedThisTurn: setup.health <= 3
			})
		})
		const state = createTestGameState({ units: { board, unitStates } })
		return (
			<BoardStory
				{...args}
				gameState={state}
				overrides={CLOSE_REVIEW_OVERRIDES}
			/>
		)
	}
}
