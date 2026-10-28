import { canAttack } from '../../combat/range'
import { previewCombat } from '../../combat/resolve'
import {
	getEffectiveUnitStatsForTerrain,
	unitToUnitStats
} from '../../domains/unit'
import { canUnitAttack } from '../../validation/unit'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_ATTACK_SCORE = 100

/**
 * Score attack actions for all units of the given tribe.
 * Prioritizes kills over chip damage, and high-value targets.
 */
export function scoreAttackActions(fixture: ScoringFixture): ScoredAction[] {
	const { gameState, gameHex, radius, researchedTechs, enemyUnits, board } =
		fixture
	const actions: ScoredAction[] = []

	for (const friendly of fixture.friendlyUnits) {
		const attackerPos = friendly.position
		const attackerTerrain = board.at(attackerPos)?.terrain
		const unitStats = attackerTerrain
			? getEffectiveUnitStatsForTerrain(friendly.unit.type, attackerTerrain)
			: unitToUnitStats[friendly.unit.type]
		if (!canUnitAttack(friendly.state, friendly.unit, unitStats)) {
			continue
		}

		for (const enemy of enemyUnits) {
			const targetPos = enemy.position

			if (
				!canAttack(
					friendly.unit,
					attackerPos,
					enemy.unit,
					targetPos,
					gameHex,
					radius,
					researchedTechs,
					attackerTerrain
				)
			) {
				continue
			}

			const targetHealth = enemy.state.health

			const { expected: damage, counter: counterDamage } = previewCombat(
				gameState,
				{
					from: attackerPos,
					to: targetPos,
					grid: { gameHex, radius }
				}
			)

			const willKill = damage >= targetHealth

			let score = BASE_ATTACK_SCORE
			if (willKill) {
				score += 50
			}
			score += (damage / unitToUnitStats[enemy.unit.type].health) * 30

			if (
				!willKill &&
				unitStats.range <= 1 &&
				counterDamage !== null &&
				counterDamage >= friendly.state.health
			) {
				score -= 60
			}

			const unitId = friendly.unit.id
			actions.push({
				kind: 'attack',
				score,
				execute: () => ({
					kind: 'attack',
					unitId,
					from: attackerPos,
					target: targetPos
				})
			})
		}
	}

	return actions
}
