import { type BoardPosition } from '../board/position'
import {
	type Unit,
	type UnitDebuff,
	type UnitId,
	type UnitMode,
	type UnitState
} from '../domains/unit'
import { type GameWorld } from '../engine/world-contract'
import { killProgress } from '../unit-state-utils'

export function freshUnitState(
	unit: Unit,
	position: BoardPosition,
	options?: { mode?: UnitMode; homeVillage?: BoardPosition }
): UnitState {
	return {
		homeVillage: options?.homeVillage ?? null,
		health: unit.stats.health,
		mode: options?.mode ?? 'ready',
		level: 1,
		kills: 0,
		killsThisTurn: 0,
		position,
		debuffs: [],
		veterancyBonusAtk: 0,
		veterancyBonusHp: 0,
		hasBeenAttackedThisTurn: false
	}
}

export function recordWorldKill(world: GameWorld, id: UnitId): void {
	const unit = world.unit(id)
	if (!unit) {
		throw new Error(`recordWorldKill: no UnitState for ${id}`)
	}
	world.updateUnit(id, killProgress(unit.state))
}

export function addWorldDebuff(
	world: GameWorld,
	id: UnitId,
	debuff: UnitDebuff
): void {
	const unit = world.unit(id)
	if (!unit) {
		throw new Error(`addWorldDebuff: no UnitState for ${id}`)
	}
	world.updateUnit(id, { debuffs: [...unit.state.debuffs, debuff] })
}
