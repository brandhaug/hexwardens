import { type Hex } from 'honeycomb-grid'
import Prando from 'prando'
import { calculateBoardDimensions } from '../board/board'
import { GAME_CONFIG } from '../config'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import {
	applyPersonalityWeight,
	type BotPersonality,
	type ScorerWeights
} from './personality'
import { type ScoredAction } from './score-context'
import { runEnabledScorers } from './scorers/registry'
import { buildScoringFixture } from './scoring-fixture'

/**
 * A turn-local random stream. Callers may inject one to share draw order
 * across decisions; standalone scoring derives a stream from the match.
 */
export type Rng = () => number

export interface BotOptions {
	/** Personality to drive scorer composition + difficulty modulation. */
	personality: BotPersonality
	/** Random source for score noise. Defaults to the match/turn/tribe seed. */
	rng?: Rng
	/**
	 * Per-call weight overrides layered on top of `personality.weights`.
	 * Used by tests / tuning experiments to flip relative scorer priority
	 * without authoring a whole new personality.
	 */
	scorerWeights?: ScorerWeights
}

export interface Bot {
	chooseAction(
		gameState: GameState,
		tribe: Tribe,
		gameHex: typeof Hex
	): ScoredAction | null
	/** Expose ranked candidates for tests and debugging. */
	scoreActions(
		gameState: GameState,
		tribe: Tribe,
		gameHex: typeof Hex
	): ScoredAction[]
}

/**
 * Construct a bot from a {@link BotPersonality}. Personality is injected
 * once and flows through the scorer pipeline via the `ScoringFixture`;
 * scorers themselves remain difficulty-agnostic and stay private to the
 * bot module.
 */
export function createBot(options: BotOptions): Bot {
	const { personality, rng, scorerWeights } = options

	function score(
		gameState: GameState,
		tribe: Tribe,
		gameHex: typeof Hex
	): ScoredAction[] {
		const fallback = new Prando(`${gameState.seed}:${gameState.turn}:${tribe}`)
		const random = rng ?? (() => fallback.next())
		const { radius } = calculateBoardDimensions(
			gameState.units.board.length,
			GAME_CONFIG.TILE_SIZE,
			GAME_CONFIG.TILE_SPACING
		)
		const fixture = buildScoringFixture({
			gameState,
			tribe,
			gameHex,
			radius,
			positionalAwareness: personality.positionalAwareness,
			lookahead: personality.lookahead
		})
		const raw = runEnabledScorers(fixture, personality.enabledScorers)
		return raw.map((action) => ({
			...action,
			score:
				applyPersonalityWeight(
					personality,
					action.kind,
					action.score,
					scorerWeights ?? {}
				) +
				(random() - 0.5) * 2 * personality.noiseRange
		}))
	}

	return {
		chooseAction(gameState, tribe, gameHex) {
			const actions = score(gameState, tribe, gameHex)
			if (actions.length === 0) {
				return null
			}
			actions.sort((a, b) => b.score - a.score)
			return actions[0] ?? null
		},
		scoreActions(gameState, tribe, gameHex) {
			const actions = score(gameState, tribe, gameHex)
			actions.sort((a, b) => b.score - a.score)
			return actions
		}
	}
}
