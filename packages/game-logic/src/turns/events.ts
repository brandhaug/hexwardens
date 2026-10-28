import { type Tech } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { type ChronicleEntry } from '../match/chronicle/chronicle-entry'
import { type BoardPosition } from '../board/position'

export type BroadcastEvent =
	| { type: 'salary'; tribe: Tribe; amount: number }
	| {
			type: 'research'
			tribe: Tribe
			tech: Tech
			completed: boolean
			turnsRemaining?: number
	  }
	| { type: 'villageLevel'; tribe: Tribe; levelUps: number }
	| { type: 'turnRotated'; from: Tribe; to: Tribe; turn: number }
	| {
			type: 'villageCaptured'
			byTribe: Tribe
			fromTribe: Tribe | null
			at: BoardPosition
	  }
	| { type: 'gameOver'; winner: Tribe | null }

export type PhaseName =
	| 'salary'
	| 'techPassives'
	| 'research'
	| 'unitReset'
	| 'debuffTick'
	| 'explorationCommit'
	| 'villageExperienceCommit'
	| 'rotation'
	| 'captureFlip'
	| 'gameOver'

export type TurnAdvance = {
	state: GameState
	events: readonly BroadcastEvent[]
	chronicleEntries: readonly ChronicleEntry[]
	gameEnded: boolean
	newCurrentTribe: Tribe | null
	/**
	 * Observable execution trace — phases that ran during this advance, in
	 * order. Tests pin canonical ordering against this; runtime callers can
	 * safely ignore it.
	 */
	phaseLog: readonly PhaseName[]
}
