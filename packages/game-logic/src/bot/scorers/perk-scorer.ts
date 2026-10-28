import { isHeroAliveForTribe } from '../../domains/unit'
import { type VillagePerk } from '../../domains/village'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_PERK_SCORE = 200
const HERO_SUMMON_BONUS = 80

/**
 * Score Perk-pick actions for any pending Perk choice the Tribe owes. Bots
 * always resolve the head-of-queue choice first (the order matches the
 * Village level-up sequence). The scorer ranks `special_unit` highly when
 * the Tribe's Hero is not on the board, and declines `special_unit` when the
 * Hero is already alive (so the Tribe takes the alternative perk instead).
 */
export function scorePerkActions(fixture: ScoringFixture): ScoredAction[] {
	const { gameState, tribe } = fixture
	const queue = gameState.pendingPerkChoices[tribe] ?? []
	const head = queue[0]
	if (!head) {
		return []
	}

	const heroAlive = isHeroAliveForTribe(gameState.units.board, tribe)
	const actions: ScoredAction[] = []
	for (const perk of head.options) {
		if (perk === 'special_unit' && heroAlive) {
			// Decline `special_unit` while the Hero is already on the board —
			// the existing Hero would die before another could spawn anyway.
			continue
		}
		const score = BASE_PERK_SCORE + perkBonus(perk, heroAlive)
		const at = head.villagePosition
		actions.push({
			kind: 'perk',
			score,
			execute: () => ({
				kind: 'tileAction',
				action: { kind: 'selectPerk', at, perk }
			})
		})
	}
	return actions
}

function perkBonus(perk: VillagePerk, heroAlive: boolean): number {
	if (perk === 'special_unit' && !heroAlive) {
		return HERO_SUMMON_BONUS
	}
	if (perk === 'increase_population') {
		return 10
	}
	if (perk === 'extra_money') {
		return 8
	}
	if (perk === 'expand_range') {
		return 6
	}
	if (perk === 'extra_experience') {
		return 4
	}
	if (perk === 'expand_sight') {
		return 2
	}
	return 0
}
