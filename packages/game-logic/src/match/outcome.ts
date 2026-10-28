import { type Tribe } from '../domains/tribe'
import { createGameWorld } from '../engine/world'
import { type GameWorld } from '../engine/world-contract'
import { calculateTribeSurvival, getAliveTribes, type GameState } from '../game'

// Safety cap so bot-vs-bot and stalemate matches can't run forever. Reaching
// the cap declares a draw (winner: null) — no tiebreaker exists (ADR-0002).
export const MAX_TURNS = 500

export type MatchOutcomeReason = 'elimination' | 'turnLimit'

export type MatchOutcome =
	| { status: 'ongoing' }
	| { status: 'ended'; winner: Tribe | null; reason: MatchOutcomeReason }

export function evaluateOutcome(
	state: GameState,
	tribesWithVillages?: Set<Tribe>
): MatchOutcome {
	return outcomeForAliveTribes(
		state,
		state.isGameOver ? [] : getAliveTribes(state, tribesWithVillages)
	)
}

function outcomeForAliveTribes(
	state: Pick<GameState, 'isGameOver' | 'winner' | 'turn'>,
	alive: readonly Tribe[]
): MatchOutcome {
	if (state.isGameOver) {
		return {
			status: 'ended',
			winner: state.winner,
			reason: 'elimination'
		}
	}
	if (alive.length <= 1) {
		return {
			status: 'ended',
			winner: alive[0] ?? null,
			reason: 'elimination'
		}
	}
	if (state.turn > MAX_TURNS) {
		return {
			status: 'ended',
			winner: null,
			reason: 'turnLimit'
		}
	}
	return { status: 'ongoing' }
}

export function sealOutcome(state: GameState): GameState {
	const world = createGameWorld(state)
	sealWorldOutcome(world)
	return world.snapshot()
}

export function sealWorldOutcome(world: GameWorld): void {
	const metadata = world.metadata()
	if (metadata.isGameOver) {
		return
	}
	const owners = new Set<Tribe>()
	for (const { tile } of world.tiles()) {
		if (tile.item?.type === 'village' && tile.item.tribe) {
			owners.add(tile.item.tribe)
		}
	}
	const { aliveTribes, eliminatedTribes } = calculateTribeSurvival(
		world.players().map((player) => player.tribe),
		metadata.eliminatedTribes,
		owners
	)
	if (owners.size > 0) {
		world.updateMetadata({ eliminatedTribes })
	}
	const outcome = outcomeForAliveTribes(metadata, aliveTribes)
	if (outcome.status === 'ended') {
		world.updateMetadata({ isGameOver: true, winner: outcome.winner })
	}
}
