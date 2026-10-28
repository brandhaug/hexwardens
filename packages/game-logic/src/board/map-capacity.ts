import { type MapSize } from '../multiplayer/types'

/** Fixed-board capacities with a full starting ring and the configured capital spacing. */
export const mapPlayerCapacity: Record<MapSize, number> = {
	small: 3,
	medium: 4,
	large: 5
}

export function canFitPlayers(mapSize: MapSize, playerCount: number): boolean {
	return (
		Number.isInteger(playerCount) &&
		playerCount >= 1 &&
		playerCount <= mapPlayerCapacity[mapSize]
	)
}
