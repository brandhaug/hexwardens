import { createGameWorld } from '../engine/world'
import { type Tribe } from '../domains/tribe'
import { type TileGrid } from '../game'

/** Generation begins with geometry only; every populated entity lives in ECS. */
export function createGenerationWorld(
	board: TileGrid,
	tribe: Tribe,
	seed: number
) {
	return createGameWorld({
		units: { board, unitStates: {} },
		playerStates: {},
		turn: 1,
		currentPlayerTribe: tribe,
		eliminatedTribes: [],
		isGameOver: false,
		winner: null,
		nextUnitId: 1,
		seed,
		pendingVillageLevelUps: {},
		pendingPerkChoices: {}
	})
}
