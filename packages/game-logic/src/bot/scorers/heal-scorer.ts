import { getEffectiveMaxHealth } from '../../domains/unit'
import { canAfford } from '../../validation/player'
import { canUnitHeal } from '../../validation/unit'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_HEAL_SCORE = 20

/**
 * Score healing actions for damaged friendly units.
 */
export function scoreHealActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []

	if (!canAfford(fixture.playerState, 1)) {
		return actions
	}

	for (const friendly of fixture.friendlyUnits) {
		if (!canUnitHeal(friendly.state)) {
			continue
		}

		const maxHealth = getEffectiveMaxHealth(friendly.unit.type, friendly.state)
		if (friendly.state.health >= maxHealth) {
			continue
		}

		const healthRatio = friendly.state.health / maxHealth
		let score = BASE_HEAL_SCORE + (1 - healthRatio) * 30
		score += friendly.unit.stats.cost * 2

		const { position } = friendly
		actions.push({
			kind: 'heal',
			score,
			execute: () => ({
				kind: 'tileAction',
				action: { kind: 'heal', at: position }
			})
		})
	}

	return actions
}
