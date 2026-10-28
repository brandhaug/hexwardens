import { constVoid } from 'effect/Function'
import { type Meta, type StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { tribes } from '@hexwardens/game-logic/domains/tribe'
import {
	type HeroUnitType,
	type UnitId
} from '@hexwardens/game-logic/domains/unit'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	createTestGameState,
	createTestHexBoard,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'
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

function buildTribeGrid(heroType: HeroUnitType): GameState {
	const board = createTestHexBoard(BOARD_RADIUS)
	const unitStates: Record<UnitId, ReturnType<typeof createTestUnitState>> = {}
	ALL_TRIBES.forEach((tribe, idx) => {
		const pos: BoardPosition = {
			q_idx: (idx % 3) + 2,
			r_idx: Math.floor(idx / 3) + 1
		}
		if (!board[pos.r_idx]?.[pos.q_idx]) {
			return
		}
		const unit = createTestUnit(tribe, heroType)
		setUnitAt(board, pos, unit)
		unitStates[unit.id] = createTestUnitState(pos, heroType)
	})
	return createTestGameState({ units: { board, unitStates } })
}

function HeroTribeGrid({ heroType }: { heroType: HeroUnitType }) {
	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(null)
	const gameState = buildTribeGrid(heroType)
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
	title: 'Game/Heroes',
	component: HeroTribeGrid,
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof HeroTribeGrid>

export default meta
type Story = StoryObj<typeof meta>

function storyForHero(heroType: HeroUnitType): Story {
	return { args: { heroType } }
}

export const Berserker = storyForHero('berserker')
export const Shogun = storyForHero('shogun')
export const Wolf = storyForHero('wolf')
export const OrcRaider = storyForHero('orc_raider')
export const BlackKnight = storyForHero('black_knight')
export const Clanker = storyForHero('clanker')
export const Paladin = storyForHero('paladin')
export const SkeletonGolem = storyForHero('skeleton_golem')
export const Frostlord = storyForHero('frostlord')
