import { defineHex, Direction } from 'honeycomb-grid'
import { GAME_CONFIG } from '../config.ts'

export const GameHex = defineHex({
	dimensions: GAME_CONFIG.TILE_SIZE
})

export const NEIGHBOR_DIRECTIONS = [
	Direction.E,
	Direction.NE,
	Direction.NW,
	Direction.W,
	Direction.SW,
	Direction.SE
] as const
