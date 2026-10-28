import { scoreMoveLookaheadActions } from '../bot-lookahead'
import {
	type ScoredAction,
	type Scorer,
	type ScorerKind
} from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'
import { typedEntries } from '../../type-utils'
import { scoreAttackActions } from './attack-scorer'
import { scoreBuildActions } from './build-scorer'
import { scoreCaptureActions } from './capture-scorer'
import { scoreCollectActions } from './collect-scorer'
import { scoreExploreActions } from './explore-scorer'
import { scoreHealActions } from './heal-scorer'
import { scoreMoveActions } from './move-scorer'
import { scorePerkActions } from './perk-scorer'
import { scoreResearchActions } from './research-scorer'
import { scoreTrainActions } from './train-scorer'

/**
 * Movement is the only scorer with a lookahead variant; the registry picks
 * which one to invoke based on `fixture.lookahead`.
 */
function scoreMovement(fixture: ScoringFixture): ScoredAction[] {
	return fixture.lookahead
		? scoreMoveLookaheadActions(fixture)
		: scoreMoveActions(fixture)
}

/**
 * Internal scorer registry, keyed by {@link ScorerKind}. The bot module
 * filters this map by a personality's `enabledScorers` to produce a
 * candidate list. Not exported from the package — personalities are the
 * only public surface for adjusting which scorers run.
 */
const scorerByKind: Record<ScorerKind, Scorer> = {
	// Insertion order matters: the resulting candidate list is consumed by
	// a stable sort, so equally-scored candidates fall back to the order
	// produced here. This must match the pre-refactor `scorer-registry`
	// for behavior preservation.
	// Perk choices outrank everything: they're zero-cost, single-shot, and
	// gate further actions on the affected Village. Resolving the queue
	// first keeps scorers from re-considering a Village before its perk
	// commits.
	perk: scorePerkActions,
	capture: scoreCaptureActions,
	attack: scoreAttackActions,
	train: scoreTrainActions,
	explore: scoreExploreActions,
	collect: scoreCollectActions,
	build: scoreBuildActions,
	heal: scoreHealActions,
	research: scoreResearchActions,
	move: scoreMovement
}

/**
 * Collect candidate `ScoredAction`s by running every enabled scorer against
 * the fixture. A scorer kind that is not in `enabled` simply contributes no
 * candidates — useful for personality variants that opt out of, e.g.,
 * research or healing.
 */
export function runEnabledScorers(
	fixture: ScoringFixture,
	enabled: ReadonlySet<ScorerKind>
): ScoredAction[] {
	const out: ScoredAction[] = []
	for (const [kind, scorer] of typedEntries(scorerByKind)) {
		if (!enabled.has(kind)) {
			continue
		}
		const candidates = scorer(fixture)
		for (const candidate of candidates) {
			out.push(candidate)
		}
	}
	return out
}
