import { getCounterAttack } from '../counter-attack'
import { calculateDamage } from '../damage-formula'
import { Board } from '../../board/board'
import { cavalryUnitTypes } from '../../domains/unit'
import { includesValue } from '../../type-utils'
import { type CombatState } from '../state'
import {
	applyTechBonuses,
	attackTechBonuses,
	defenseTechBonuses
} from './tech-bonuses'

type DamageCtx = {
	atk: number
	def: number
	damage: number
}

type Modifier = {
	readonly name: string
	readonly phase: 'atk' | 'def' | 'finisher'
	readonly apply: (state: CombatState, ctx: DamageCtx) => void
}

function getBushidoBonus(state: CombatState): number {
	const board = Board.from(state.gameState.units.board)
	for (const nPos of board.neighborsOf(state.attacker.pos)) {
		const tile = board.at(nPos)
		if (
			tile?.unit?.type === 'shogun' &&
			tile.unit.tribe === state.attacker.unit.tribe
		) {
			return 3
		}
	}
	return 0
}

function getFortifyBonus(state: CombatState): number {
	const board = Board.from(state.gameState.units.board)
	for (const nPos of board.neighborsOf(state.defender.pos)) {
		const tile = board.at(nPos)
		if (
			tile?.unit?.type === 'clanker' &&
			tile.unit.tribe === state.defender.unit.tribe
		) {
			return 5
		}
	}
	return 0
}

function getDebuffAtkReduction(state: CombatState): number {
	return state.attacker.state.debuffs.reduce(
		(sum, d) => sum + d.atkReduction,
		0
	)
}

/**
 * Canonical modifier list. Order is meaningful — reordering changes balance,
 * so the canonical-order is enforced by combat tests against observable
 * damage, not by the array layout alone. The list is private; abilities
 * don't see it directly. Per-ability side effects live in `../abilities/`.
 * Per-Tech damage bonuses are declarative entries in `./tech-bonuses.ts` so
 * adding a new ADR-0003 Tech passive is one registry append, not a new
 * if-branch in this file.
 */
const MODIFIERS: readonly Modifier[] = [
	{
		name: 'veterancy_atk',
		phase: 'atk',
		apply: (s, ctx) => {
			ctx.atk += s.attacker.state.veterancyBonusAtk
		}
	},
	{
		name: 'brace',
		phase: 'atk',
		apply: (s, ctx) => {
			if (
				s.attacker.stats.passive === 'brace' &&
				s.isCounterAttack &&
				includesValue(cavalryUnitTypes, s.defender.unit.type)
			) {
				ctx.atk = Math.floor(ctx.atk * 1.5)
			}
		}
	},
	{
		name: 'cleave',
		phase: 'atk',
		apply: (s, ctx) => {
			if (
				s.attacker.stats.passive === 'cleave' &&
				s.defender.stats.range === 1
			) {
				ctx.atk += 2
			}
		}
	},
	{
		name: 'rage',
		phase: 'atk',
		apply: (s, ctx) => {
			if (
				s.attacker.unit.type === 'berserker' &&
				s.attacker.state.killsThisTurn
			) {
				ctx.atk += s.attacker.state.killsThisTurn * 2
			}
		}
	},
	{
		name: 'bushido',
		phase: 'atk',
		apply: (s, ctx) => {
			ctx.atk += getBushidoBonus(s)
		}
	},
	{
		name: 'debuff_atk_reduction',
		phase: 'atk',
		apply: (s, ctx) => {
			const reduction = getDebuffAtkReduction(s)
			if (reduction) {
				ctx.atk = Math.max(1, ctx.atk - reduction)
			}
		}
	},
	{
		name: 'tech_atk_bonuses',
		phase: 'atk',
		apply: (s, ctx) => {
			ctx.atk += applyTechBonuses(s, s.attacker.techs, attackTechBonuses)
		}
	},
	{
		name: 'fortify',
		phase: 'def',
		apply: (s, ctx) => {
			ctx.def += getFortifyBonus(s)
		}
	},
	{
		name: 'tech_def_bonuses',
		phase: 'def',
		apply: (s, ctx) => {
			ctx.def += applyTechBonuses(s, s.defender.techs, defenseTechBonuses)
		}
	},
	{
		name: 'piercing_shot',
		phase: 'def',
		apply: (s, ctx) => {
			if (s.attacker.unit.type === 'paladin') {
				ctx.def = 0
			}
		}
	},
	{
		name: 'defense_reduction',
		phase: 'finisher',
		apply: (s, ctx) => {
			ctx.damage = calculateDamage(
				ctx.atk,
				ctx.def,
				s.attacker.state.health,
				s.attacker.maxHp,
				s.defender.state.health,
				s.defender.maxHp
			)
		}
	},
	{
		name: 'ambush',
		phase: 'finisher',
		apply: (s, ctx) => {
			const terrain = s.attacker.tile.terrain
			if (
				s.attacker.unit.type === 'wolf' &&
				(terrain === 'jungle' || terrain === 'forest')
			) {
				ctx.damage = Math.floor(ctx.damage * 1.5)
			}
		}
	}
] as const

export function computeDamage(state: CombatState): number {
	const ctx: DamageCtx = {
		atk: state.isCounterAttack
			? getCounterAttack(state.attacker.unit.type, state.attacker.tile.terrain)
			: state.attacker.stats.attack,
		def: state.defender.stats.defense,
		damage: 0
	}
	for (const mod of MODIFIERS) {
		mod.apply(state, ctx)
	}
	return ctx.damage
}
