import { type Meta, type StoryObj } from '@storybook/react-vite'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { positionKey } from '@hexwardens/game-logic/board/position'
import { primaryBuildings } from '@hexwardens/game-logic/domains/primary-building'
import { secondaryBuildings } from '@hexwardens/game-logic/domains/secondary-building'
import {
	tribeToTribeStats,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'

import {
	generalUnitTypes,
	type UnitId
} from '@hexwardens/game-logic/domains/unit'
import { createVillage } from '@hexwardens/game-logic/domains/village'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	createTestGameState,
	createTestHexBoard,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import {
	ALL_TRIBES,
	BOARD_RADIUS,
	BOARD_SIZE,
	BoardStory,
	CLOSE_REVIEW_OVERRIDES,
	emptyState,
	interactionScene,
	SelectedBoardStory,
	setItem,
	setTerrain,
	TOP_DOWN_OVERRIDES
} from './board-stories-shared'

const meta = {
	title: 'Game/Board/Gameplay',
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

export const Default: Story = {
	render: (args) => <BoardStory {...args} gameState={emptyState()} />
}

export const AllTribesShowcase: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const unitStates: Record<
			UnitId,
			ReturnType<typeof createTestUnitState>
		> = {}
		ALL_TRIBES.forEach((tribe, idx) => {
			const villagePos: BoardPosition = {
				q_idx: (idx % 3) + 2,
				r_idx: Math.floor(idx / 3) * 2 + 1
			}
			setItem(board, villagePos, {
				...createVillage(2),
				tribe,
				state: 'built'
			})
			const heroPos: BoardPosition = {
				q_idx: villagePos.q_idx,
				r_idx: villagePos.r_idx + 1
			}
			if (board[heroPos.r_idx]?.[heroPos.q_idx]) {
				const heroType = tribeToTribeStats[tribe].heroUnit
				const unit = createTestUnit(tribe, heroType)
				setUnitAt(board, heroPos, unit)
				unitStates[unit.id] = createTestUnitState(heroPos, heroType)
			}
		})
		const state = createTestGameState({ units: { board, unitStates } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const FogOfWar: Story = {
	args: { revealAll: false },
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		setItem(
			board,
			{ q_idx: BOARD_RADIUS, r_idx: BOARD_RADIUS },
			{
				...createVillage(3, 'capital'),
				tribe: args.currentPlayerTribe,
				level: 3,
				state: 'built'
			}
		)
		setItem(
			board,
			{ q_idx: 0, r_idx: 0 },
			{ ...createVillage(2), tribe: 'orcs', state: 'built' }
		)
		setItem(
			board,
			{ q_idx: BOARD_SIZE - 1, r_idx: 0 },
			{ ...createVillage(2), tribe: 'rogues', state: 'built' }
		)
		const baseState = createTestGameState({ units: { board, unitStates: {} } })
		const exploration: Record<string, true> = {}
		exploration[positionKey({ q_idx: BOARD_SIZE - 1, r_idx: 0 })] = true
		exploration[positionKey({ q_idx: BOARD_SIZE - 1, r_idx: 1 })] = true
		exploration[positionKey({ q_idx: BOARD_SIZE - 2, r_idx: 0 })] = true
		const fogged: GameState = {
			...baseState,
			playerStates: {
				...baseState.playerStates,
				[args.currentPlayerTribe]: {
					...baseState.playerStates[args.currentPlayerTribe],
					exploration
				}
			}
		}
		return <BoardStory {...args} gameState={fogged} />
	}
}

export const Megaboard: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const terrainRow: TileTerrain[] = ['forest', 'stone', 'desert', 'jungle']
		terrainRow.forEach((terrain, idx) => {
			setTerrain(board, { q_idx: 3 + idx, r_idx: 0 }, terrain)
		})
		primaryBuildings.forEach((value, idx) => {
			setItem(
				board,
				{ q_idx: 2 + idx, r_idx: 1 },
				{
					type: 'primaryBuilding',
					value,
					state: 'built',
					tribe: args.currentPlayerTribe
				}
			)
		})
		secondaryBuildings.forEach((value, idx) => {
			setItem(
				board,
				{ q_idx: 1 + idx, r_idx: 2 },
				{
					type: 'secondaryBuilding',
					value,
					state: 'built',
					tribe: args.currentPlayerTribe
				}
			)
		})
		ALL_TRIBES.slice(0, 4).forEach((tribe, idx) => {
			setItem(
				board,
				{ q_idx: idx, r_idx: 4 },
				{ ...createVillage(2), tribe, state: 'built' }
			)
		})
		const unitStates: Record<
			UnitId,
			ReturnType<typeof createTestUnitState>
		> = {}
		generalUnitTypes.slice(0, 5).forEach((type, idx) => {
			const pos: BoardPosition = { q_idx: idx, r_idx: 5 }
			if (!board[pos.r_idx]?.[pos.q_idx]) {
				return
			}
			const unit = createTestUnit(args.currentPlayerTribe, type)
			setUnitAt(board, pos, unit)
			unitStates[unit.id] = createTestUnitState(pos, type)
		})
		const state = createTestGameState({ units: { board, unitStates } })
		return <BoardStory {...args} gameState={state} />
	}
}

export const TopDown: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		primaryBuildings.forEach((value, idx) => {
			setItem(
				board,
				{ q_idx: idx + 1, r_idx: 1 },
				{
					type: 'primaryBuilding',
					value,
					state: 'built',
					tribe: args.currentPlayerTribe
				}
			)
		})
		ALL_TRIBES.slice(0, 5).forEach((tribe, idx) => {
			setItem(
				board,
				{ q_idx: idx + 1, r_idx: 3 },
				{ ...createVillage(2), tribe, state: 'built' }
			)
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return (
			<BoardStory {...args} gameState={state} overrides={TOP_DOWN_OVERRIDES} />
		)
	}
}

export const SelectedTile: Story = {
	render: (args) => {
		const { board, unitStates, attackerPos } = interactionScene(
			args.currentPlayerTribe
		)
		const state = createTestGameState({ units: { board, unitStates } })
		return (
			<SelectedBoardStory
				gameState={state}
				currentPlayerTribe={args.currentPlayerTribe}
				selected={attackerPos}
				revealAll={args.revealAll}
			/>
		)
	}
}

export const MoveAndAttackTargets: Story = {
	render: (args) => {
		const { board, unitStates, attackerPos } = interactionScene(
			args.currentPlayerTribe
		)
		const state = createTestGameState({ units: { board, unitStates } })
		return (
			<SelectedBoardStory
				gameState={state}
				currentPlayerTribe={args.currentPlayerTribe}
				selected={attackerPos}
				revealAll={args.revealAll}
			/>
		)
	}
}

export const OwnershipAndBuildStates: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const owners: readonly Tribe[] = [
			args.currentPlayerTribe,
			'rogues',
			'druids',
			'wraiths'
		]
		const villageLevels = [1, 2, 3, 4] as const
		owners.forEach((tribe, idx) => {
			setItem(
				board,
				{ q_idx: idx + 1, r_idx: 2 },
				{
					type: 'primaryBuilding',
					value: primaryBuildings[idx] ?? 'farm',
					state: 'built',
					tribe
				}
			)
			setItem(
				board,
				{ q_idx: idx + 1, r_idx: 3 },
				{
					...createVillage(2),
					tribe,
					state: 'built',
					level: villageLevels[idx] ?? 1
				}
			)
		})
		setItem(
			board,
			{ q_idx: 2, r_idx: 4 },
			{
				type: 'secondaryBuilding',
				value: 'dock',
				state: 'large',
				tribe: args.currentPlayerTribe
			}
		)
		setItem(
			board,
			{ q_idx: 3, r_idx: 4 },
			{
				type: 'utilityBuilding',
				value: 'market',
				state: 'built',
				tribe: 'engineers'
			}
		)
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return (
			<BoardStory
				{...args}
				gameState={state}
				overrides={CLOSE_REVIEW_OVERRIDES}
			/>
		)
	}
}

export const MixedGameplayReview: Story = {
	render: (args) => {
		const { board, unitStates, attackerPos } = interactionScene(
			args.currentPlayerTribe
		)
		const terrainRow: TileTerrain[] = [
			'forest',
			'desert',
			'swamp',
			'snow',
			'water'
		]
		terrainRow.forEach((terrain, idx) => {
			setTerrain(board, { q_idx: idx + 1, r_idx: 1 }, terrain)
		})
		setItem(
			board,
			{ q_idx: 2, r_idx: 4 },
			{
				type: 'resource',
				value: 'gem'
			}
		)
		setItem(
			board,
			{ q_idx: 4, r_idx: 4 },
			{
				type: 'secondaryBuilding',
				value: 'blacksmith',
				state: 'built',
				tribe: 'orcs'
			}
		)
		const state = createTestGameState({ units: { board, unitStates } })
		return (
			<SelectedBoardStory
				gameState={state}
				currentPlayerTribe={args.currentPlayerTribe}
				selected={attackerPos}
				revealAll={args.revealAll}
				overrides={CLOSE_REVIEW_OVERRIDES}
			/>
		)
	}
}
