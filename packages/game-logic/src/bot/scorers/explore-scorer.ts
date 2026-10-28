import { canUnitExplore } from '../../validation/unit'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_EXPLORE_SCORE = 50

/**
 * Score ruins exploration actions for units standing on ruins.
 */
export function scoreExploreActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []

	for (const friendly of fixture.friendlyUnits) {
		if (!canUnitExplore(friendly.state)) {
			continue
		}
		const { tile, position } = friendly
		if (tile.item?.type !== 'ruins') {
			continue
		}

		actions.push({
			kind: 'explore',
			score: BASE_EXPLORE_SCORE,
			execute: () => ({
				kind: 'tileAction',
				action: { kind: 'explore', at: position }
			})
		})
	}

	return actions
}
