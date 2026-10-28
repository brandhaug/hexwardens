import { calculateBoardDimensions } from '../../board/board'
import { GameHex } from '../../board/hex-utils'
import { GAME_CONFIG } from '../../config'
import { type Tribe } from '../../domains/tribe'
import { type GameState } from '../../game'
import { buildScoringFixture, type ScoringFixture } from '../scoring-fixture'

/**
 * Test helper: build a ScoringFixture for the given game state and tribe with
 * default difficulty flags (both off). Override flags for tests that need them.
 */
export function fixtureOf(
	gameState: GameState,
	tribe: Tribe,
	flags?: { positionalAwareness?: boolean; lookahead?: boolean }
): ScoringFixture {
	const { radius } = calculateBoardDimensions(
		gameState.units.board.length,
		GAME_CONFIG.TILE_SIZE,
		GAME_CONFIG.TILE_SPACING
	)
	return buildScoringFixture({
		gameState,
		tribe,
		gameHex: GameHex,
		radius,
		positionalAwareness: flags?.positionalAwareness ?? false,
		lookahead: flags?.lookahead ?? false
	})
}
