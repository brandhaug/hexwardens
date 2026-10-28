import { Board, type BoardPosition } from '../../board/board'
import { type GameWorld } from '../../engine/world-contract'
import { isHeroUnitType } from '../../domains/unit'
import { isWaterTerrain } from '../../tile/tile-terrain'
import { recordWorldKill } from '../../units/world-units'
import { type CombatState } from '../state'
import { type CombatEvent } from '../types'

export type KnockbackOutcome = {
	readonly events: readonly CombatEvent[]
	readonly targetRemoved: boolean
	readonly targetMoved: boolean
	readonly kill: { readonly victimPos: BoardPosition } | null
}

const unchanged: KnockbackOutcome = {
	events: [],
	targetRemoved: false,
	targetMoved: false,
	kill: null
}

export function applyKnockback(
	state: CombatState,
	world: GameWorld
): KnockbackOutcome {
	if (state.attacker.stats.passive !== 'knockback') {
		return unchanged
	}
	const target = world.unit(state.defender.unit.id)
	if (!target) {
		return unchanged
	}
	const board = Board.from(world.snapshot().units.board)
	const destination = board.pushDestination(
		state.attacker.pos,
		state.defender.pos
	)
	if (!destination) {
		return unchanged
	}
	const tile = world.tile(destination)
	const blocked =
		!board.contains(destination) || !tile || !!tile.unit || tile.isMountain
	const drowned =
		!blocked && isWaterTerrain(tile.terrain) && !canSurviveWater(state)
	let outcome: 'blocked' | 'drowned' | 'pushed' = 'pushed'
	if (blocked) {
		outcome = 'blocked'
	} else if (drowned) {
		outcome = 'drowned'
	}
	const events: CombatEvent[] = [
		{
			type: 'knockback',
			attackerId: state.attacker.unit.id,
			targetId: target.unit.id,
			outcome,
			from: state.defender.pos,
			to: destination
		}
	]
	if (drowned || (blocked && target.state.health <= 5)) {
		world.removeUnit(target.unit.id)
		recordWorldKill(world, state.attacker.unit.id)
		events.push({
			type: 'kill',
			killerId: state.attacker.unit.id,
			victimId: target.unit.id
		})
		return {
			events,
			targetRemoved: true,
			targetMoved: false,
			kill: { victimPos: state.defender.pos }
		}
	}
	if (blocked) {
		world.updateUnit(target.unit.id, { health: target.state.health - 5 })
	} else {
		world.moveUnit(target.unit.id, destination)
	}
	return { events, targetRemoved: false, targetMoved: !blocked, kill: null }
}

function canSurviveWater(state: CombatState): boolean {
	const { unit, tile, stats } = state.defender
	return (
		isWaterTerrain(tile.terrain) ||
		unit.type === 'bombardier' ||
		unit.type === 'tidebreaker' ||
		(isHeroUnitType(unit.type) && stats.waterMovement >= 2)
	)
}
