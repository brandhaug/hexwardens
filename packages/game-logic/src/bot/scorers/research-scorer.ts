import {
	getAvailableTechs,
	techTree,
	tribeToAlignedTechs
} from '../../domains/tech'
import { canAfford } from '../../validation/player'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_RESEARCH_SCORE = 55

/**
 * Score tech research actions.
 * The bot researches at the first available village.
 */
export function scoreResearchActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []
	const { playerState, friendlyVillages, tribe } = fixture

	if (!playerState) {
		return actions
	}
	if (playerState.researchInProgress) {
		return actions
	}

	const availableTechs = getAvailableTechs(playerState.researchedTechs)
	if (availableTechs.length === 0) {
		return actions
	}

	const villagePosition = friendlyVillages[0]
	if (!villagePosition) {
		return actions
	}

	const alignedTechs = new Set(tribeToAlignedTechs[tribe])

	for (const tech of availableTechs) {
		const node = techTree[tech]
		if (!canAfford(playerState, node.cost)) {
			continue
		}

		let score = BASE_RESEARCH_SCORE
		score += (5 - node.tier) * 5

		if (playerState.money > node.cost + 5) {
			score += 10
		}

		if (alignedTechs.has(tech)) {
			score += 10
		}

		score -= node.turnsToResearch * 3

		actions.push({
			kind: 'research',
			score,
			execute: () => ({
				kind: 'tileAction',
				action: { kind: 'research', at: villagePosition, tech }
			})
		})
	}

	return actions
}
