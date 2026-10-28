import { canAfford } from '../../validation/player'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_COLLECT_SCORE = 40

/**
 * Score resource collection actions within village range.
 */
export function scoreCollectActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []

	if (!canAfford(fixture.playerState, 2)) {
		return actions
	}

	const candidates = fixture.candidateTiles(
		(pos, tile) =>
			tile.item?.type === 'resource' &&
			fixture.villageRange.has(fixture.board.key(pos))
	)

	for (const [position] of candidates) {
		actions.push({
			kind: 'collect',
			score: BASE_COLLECT_SCORE,
			execute: () => ({
				kind: 'tileAction',
				action: { kind: 'collect', at: position }
			})
		})
	}

	return actions
}
