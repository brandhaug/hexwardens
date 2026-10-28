import {
	type Tech,
	hasTechPassive,
	type TechPassiveType
} from '../../domains/tech'

import { cavalryUnitTypes } from '../../domains/unit'
import { type ReadonlyData, includesValue } from '../../type-utils'
import { type CombatState } from '../state'

/**
 * Declarative Tech-passive damage bonuses. Each new Tech that shapes damage
 * lands as one entry in `attackTechBonuses` or `defenseTechBonuses` — no new
 * if-branch in the modifier pipeline. The fan-in pain that earned this
 * extraction was the `tech_atk_bonuses` / `tech_def_bonuses` blobs growing
 * one if-branch per ADR-0003 Tech-Path addition; this registry concentrates
 * the "which passives shape the damage number" knowledge into one file.
 *
 * `when` defaults to always-true; `delta` returns the points to add. Both
 * receive readonly combatants and the counter-attack flag. They cannot
 * access the authoritative game state or grid.
 */
type TechBonusContext = ReadonlyData<
	Pick<CombatState, 'attacker' | 'defender' | 'isCounterAttack'>
>

export interface TechPassiveDamageBonus {
	readonly passive: TechPassiveType
	readonly when?: (state: TechBonusContext) => boolean
	readonly delta: (state: TechBonusContext) => number
}

function isDefendingOwnedVillage(state: TechBonusContext): boolean {
	const item = state.defender.tile.item
	return item?.type === 'village' && item.tribe === state.defender.unit.tribe
}

function defenseHalfBonus(defense: number): number {
	return Math.ceil(defense * 0.5)
}

export const attackTechBonuses: readonly TechPassiveDamageBonus[] = [
	{
		passive: 'tracking',
		when: (s) => s.attacker.stats.range === 1,
		delta: () => 1
	},
	{
		passive: 'tactics_bonus',
		when: (s) => !s.isCounterAttack,
		delta: () => 2
	},
	{
		passive: 'mastery_bonus',
		delta: () => 2
	}
]

export const defenseTechBonuses: readonly TechPassiveDamageBonus[] = [
	{
		passive: 'smithing_bonus',
		when: (s) => s.defender.stats.range === 1,
		delta: () => 2
	},
	{
		passive: 'city_defense',
		when: isDefendingOwnedVillage,
		delta: () => 5
	},
	{
		passive: 'mastery_bonus',
		delta: () => 2
	},
	{
		passive: 'guard_mastery',
		when: (s) => s.defender.unit.type === 'guard',
		delta: (s) => defenseHalfBonus(s.defender.stats.defense)
	},
	{
		passive: 'cavalry_mastery',
		when: (s) => includesValue(cavalryUnitTypes, s.defender.unit.type),
		delta: (s) => defenseHalfBonus(s.defender.stats.defense)
	}
]

/**
 * Sum the deltas of every Tech bonus that applies to the given combat state,
 * given the relevant participant's researched techs (attacker for attack
 * bonuses, defender for defense bonuses).
 */
export function applyTechBonuses(
	state: TechBonusContext,
	techs: readonly Tech[],
	bonuses: readonly TechPassiveDamageBonus[]
): number {
	if (techs.length === 0) {
		return 0
	}
	let total = 0
	for (const bonus of bonuses) {
		if (!hasTechPassive(techs, bonus.passive)) {
			continue
		}
		if (bonus.when && !bonus.when(state)) {
			continue
		}
		total += bonus.delta(state)
	}
	return total
}
