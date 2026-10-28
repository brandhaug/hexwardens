import { type Meta, type StoryObj } from '@storybook/react-vite'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import {
	isObstacleTerrain,
	obstacleTerrains,
	terrainToObstacleKind
} from '@hexwardens/game-logic/domains/obstacle'
import { type PrimaryBuildingValue } from '@hexwardens/game-logic/domains/primary-building'
import {
	type ResourceValue,
	resourceToTerrain,
	resources
} from '@hexwardens/game-logic/domains/resource'

import { type SecondaryBuildingValue } from '@hexwardens/game-logic/domains/secondary-building'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	createTestGameState,
	createTestHexBoard
} from '@hexwardens/game-logic/test/game-test-helpers'
import {
	isWaterTerrain,
	terrains,
	type TileTerrain
} from '@hexwardens/game-logic/tile/tile-terrain'
import {
	ALL_TRIBES,
	BOARD_RADIUS,
	BOARD_SIZE,
	BoardStory,
	emptyState,
	setItem,
	setObstacle,
	setTerrain,
	validHexPositions
} from './board-stories-shared'

const meta = {
	title: 'Game/Board/Terrains',
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

export const AllTerrains: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const positions = validHexPositions(board)
		terrains.forEach((terrain, idx) => {
			const pos = positions[idx]
			if (!pos) {
				return
			}
			setTerrain(board, pos, terrain)
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}

type TerrainEcosystem = {
	readonly resources: readonly ResourceValue[]
	readonly primary: PrimaryBuildingValue | null
	readonly secondary: SecondaryBuildingValue | null
}

function resourcesForTerrain(terrain: TileTerrain): readonly ResourceValue[] {
	return resources.filter((value) => resourceToTerrain[value] === terrain)
}

type ShowcaseTerrain = Exclude<TileTerrain, 'stone'>

const terrainEcosystem: Record<ShowcaseTerrain, TerrainEcosystem> = {
	grass: {
		resources: resourcesForTerrain('grass'),
		primary: 'farm',
		secondary: 'windmill'
	},
	snow: {
		resources: resourcesForTerrain('snow'),
		primary: 'farm',
		secondary: 'windmill'
	},
	ice: {
		resources: resourcesForTerrain('ice'),
		primary: 'mine',
		secondary: 'blacksmith'
	},
	forest: {
		resources: resourcesForTerrain('forest'),
		primary: 'lumber mill',
		secondary: 'watermill'
	},
	desert: {
		resources: resourcesForTerrain('desert'),
		primary: 'camp',
		secondary: 'stables'
	},
	jungle: {
		resources: resourcesForTerrain('jungle'),
		primary: 'lumber mill',
		secondary: 'watermill'
	},
	swamp: {
		resources: resourcesForTerrain('swamp'),
		primary: 'lumber mill',
		secondary: 'watermill'
	},
	tundra: {
		resources: resourcesForTerrain('tundra'),
		primary: 'farm',
		secondary: 'windmill'
	},
	terraced: {
		resources: resourcesForTerrain('terraced'),
		primary: 'mine',
		secondary: 'blacksmith'
	},
	barren: {
		resources: resourcesForTerrain('barren'),
		primary: 'camp',
		secondary: 'stables'
	},
	water: {
		resources: resourcesForTerrain('water'),
		primary: 'tavern',
		secondary: 'dock'
	},
	ocean: {
		resources: resourcesForTerrain('ocean'),
		primary: 'tavern',
		secondary: 'dock'
	}
}

function buildTerrainShowcase(
	terrain: ShowcaseTerrain,
	tribe: Tribe
): GameState {
	const board = createTestHexBoard(BOARD_RADIUS)
	for (const pos of validHexPositions(board)) {
		setTerrain(board, pos, terrain)
	}
	if (!isWaterTerrain(terrain)) {
		const mountainPos: BoardPosition = { q_idx: 4, r_idx: 1 }
		const row = board[mountainPos.r_idx]
		const mountainTile = row?.[mountainPos.q_idx]
		if (row && mountainTile) {
			row[mountainPos.q_idx] = {
				...mountainTile,
				isMountain: true
			}
		}
	}
	const eco = terrainEcosystem[terrain]
	const middleRow = BOARD_RADIUS
	const totalItems =
		eco.resources.length + (eco.primary ? 1 : 0) + (eco.secondary ? 1 : 0)
	let q = Math.max(0, Math.floor((BOARD_SIZE - totalItems) / 2))
	eco.resources.forEach((value) => {
		setItem(board, { q_idx: q, r_idx: middleRow }, { type: 'resource', value })
		q += 1
	})
	if (eco.primary) {
		setItem(
			board,
			{ q_idx: q, r_idx: middleRow },
			{
				type: 'primaryBuilding',
				value: eco.primary,
				state: 'built',
				tribe
			}
		)
		q += 1
	}
	if (eco.secondary) {
		setItem(
			board,
			{ q_idx: q, r_idx: middleRow },
			{
				type: 'secondaryBuilding',
				value: eco.secondary,
				state: 'built',
				tribe
			}
		)
	}
	if (isObstacleTerrain(terrain)) {
		const obstacle = terrainToObstacleKind[terrain]
		const obstacleRow = Math.min(BOARD_SIZE - 1, middleRow + 2)
		const obstacleCols = [1, 3, 5]
		for (const q_idx of obstacleCols) {
			setObstacle(board, { q_idx, r_idx: obstacleRow }, obstacle)
		}
	}
	return createTestGameState({ units: { board, unitStates: {} } })
}

function terrainShowcaseStory(terrain: ShowcaseTerrain): Story {
	return {
		render: (args) => (
			<BoardStory
				{...args}
				gameState={buildTerrainShowcase(terrain, args.currentPlayerTribe)}
			/>
		)
	}
}

export const TerrainGrass: Story = terrainShowcaseStory('grass')
export const TerrainSnow: Story = terrainShowcaseStory('snow')
export const TerrainIce: Story = terrainShowcaseStory('ice')
export const TerrainForest: Story = terrainShowcaseStory('forest')
export const TerrainDesert: Story = terrainShowcaseStory('desert')
export const TerrainJungle: Story = terrainShowcaseStory('jungle')
export const TerrainSwamp: Story = terrainShowcaseStory('swamp')
export const TerrainTundra: Story = terrainShowcaseStory('tundra')
export const TerrainTerraced: Story = terrainShowcaseStory('terraced')
export const TerrainBarren: Story = terrainShowcaseStory('barren')
export const TerrainWater: Story = terrainShowcaseStory('water')
export const TerrainOcean: Story = terrainShowcaseStory('ocean')

export const AllObstacles: Story = {
	render: (args) => {
		const board = createTestHexBoard(BOARD_RADIUS)
		const positions = validHexPositions(board)
		obstacleTerrains.forEach((terrain, idx) => {
			const pos = positions[idx]
			if (!pos) {
				return
			}
			setTerrain(board, pos, terrain)
			setObstacle(board, pos, terrainToObstacleKind[terrain])
		})
		const state = createTestGameState({ units: { board, unitStates: {} } })
		return <BoardStory {...args} gameState={state} />
	}
}
