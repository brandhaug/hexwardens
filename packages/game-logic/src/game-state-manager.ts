import { findControllingVillage } from './domains/village'
import { type UnitId, type UnitState, unitToUnitStats } from './domains/unit'

import { type GameState } from './game'
import { typedFromEntries } from './type-utils'
import { type UnitStateRecord } from './unit-state-utils'

/**
 * Initialize unit states record from the current board state
 */
export function initializeUnitStatesRecord(
	gameState: GameState
): UnitStateRecord {
	const entries: [UnitId, UnitState][] = []

	gameState.units.board.forEach((row, r_idx) => {
		row.forEach((tile, q_idx) => {
			if (tile?.unit) {
				const unit = tile.unit
				const baseHealth = unitToUnitStats[unit.type].health
				const home = findControllingVillage(
					{ r_idx, q_idx },
					gameState,
					unit.tribe
				)
				entries.push([
					unit.id,
					{
						homeVillage: home?.position ?? null,
						health: baseHealth,
						mode: 'ready',
						level: 1,
						kills: 0,
						killsThisTurn: 0,
						position: { r_idx, q_idx },
						debuffs: [],
						veterancyBonusAtk: 0,
						veterancyBonusHp: 0,
						hasBeenAttackedThisTurn: false
					}
				])
			}
		})
	})

	return typedFromEntries(entries)
}
