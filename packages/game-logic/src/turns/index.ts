import { type Tribe } from '../domains/tribe'
import { createGameWorld } from '../engine/world'
import { type GameState } from '../game'
import { entriesFromBroadcastEvents } from '../match/chronicle/entries-from-events'
import { getActivePlayerStates } from '../player/player-state'
import { type BroadcastEvent, type PhaseName, type TurnAdvance } from './events'
import { turnRules } from './turn-rules'

export type { BroadcastEvent, PhaseName, TurnAdvance } from './events'

export type TurnContext = { tribe?: Tribe }

const phaseOrder: readonly PhaseName[] = [
	'salary',
	'techPassives',
	'research',
	'unitReset',
	'debuffTick',
	'explorationCommit',
	'villageExperienceCommit',
	'rotation',
	'captureFlip',
	'gameOver'
]

/** Ordered synchronous rules share a private candidate; publish only the completed turn. */
export function advanceTurn(
	state: GameState,
	ctx: TurnContext = {}
): TurnAdvance {
	if (
		getActivePlayerStates(state.playerStates, state.eliminatedTribes).length ===
		0
	) {
		return {
			state,
			events: [],
			chronicleEntries: [],
			gameEnded: state.isGameOver,
			newCurrentTribe: state.isGameOver ? null : state.currentPlayerTribe,
			phaseLog: []
		}
	}
	const world = createGameWorld(state)
	const events: BroadcastEvent[] = []
	const phaseLog: PhaseName[] = []
	for (const phase of phaseOrder) {
		events.push(
			...turnRules[phase](world, ctx.tribe ?? state.currentPlayerTribe)
		)
		phaseLog.push(phase)
	}
	const next = world.snapshot()
	return {
		state: next,
		events,
		chronicleEntries: entriesFromBroadcastEvents(events, state.turn),
		gameEnded: next.isGameOver,
		newCurrentTribe: next.isGameOver ? null : next.currentPlayerTribe,
		phaseLog
	}
}
