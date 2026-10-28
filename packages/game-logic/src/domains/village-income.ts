import { type GameState } from '../game'
import { type Tribe } from './tribe'

export function totalVillageSalary(state: GameState, tribe: Tribe): number {
	let total = 0
	const board = state.units.board
	for (const row of board) {
		for (const tile of row) {
			if (tile?.item?.type === 'village' && tile.item.tribe === tribe) {
				total += tile.item.salary
			}
		}
	}
	return total
}
