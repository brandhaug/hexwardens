import { canUnitCapture } from '../../validation/unit'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_CAPTURE_SCORE = 200

/**
 * Score village capture actions. Highest priority action for the bot.
 */
export function scoreCaptureActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []

	for (const friendly of fixture.friendlyUnits) {
		const { tile, unit, position } = friendly
		if (tile.item?.type !== 'village') {
			continue
		}
		if (tile.item.tribe === fixture.tribe) {
			continue
		}
		if (!canUnitCapture(friendly.state, unit)) {
			continue
		}

		actions.push({
			kind: 'capture',
			score: BASE_CAPTURE_SCORE,
			execute: () => ({
				kind: 'tileAction',
				action: { kind: 'capture', at: position }
			})
		})
	}

	return actions
}
