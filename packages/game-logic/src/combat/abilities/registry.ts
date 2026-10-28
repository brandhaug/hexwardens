import { type BoardPosition } from '../../board/board'
import { type Unit, type UnitMode, type UnitType } from '../../domains/unit'
import { type GameWorld } from '../../engine/world-contract'
import { type Combatant, type CombatState } from '../state'
import { type CombatEvent } from '../types'

/**
 * Phase: before damage is computed. The hook can short-circuit the entire
 * combat by returning `dodged: true`, in which case no damage / counter / kill
 * processing happens. The hook may also mutate the candidate world (e.g., set the
 * attacker to `acted` for a Mirage dodge) and emit events.
 */
export type PreDamageHook = {
	readonly state: CombatState
	readonly world: GameWorld
	readonly events: readonly CombatEvent[]
	readonly dodged: boolean
	/** Optional short-circuit message replacing the default attack message. */
	readonly message: string | null
}

/**
 * Phase: damage is computed but not yet applied to defender HP. Abilities here
 * can adjust the world (e.g., mark the defender as having been attacked
 * this turn for Skeleton Golem bookkeeping) and emit events.
 */
export type DamageCtx = {
	readonly state: CombatState
	readonly world: GameWorld
	readonly damage: number
	readonly events: readonly CombatEvent[]
}

/** Counter target can dodge before damage or hit effects run. */
export type BeforeCounterHook = {
	readonly world: GameWorld
	readonly events: readonly CombatEvent[]
	readonly target: Combatant
}

/**
 * Phase: a target survived a landed attack or counter. Abilities here apply
 * debuffs and other hit effects once after damage.
 */
export type PostHitHook = {
	readonly state: CombatState
	readonly world: GameWorld
	readonly events: readonly CombatEvent[]
	/** True during counter-attack, false for the initial attack. */
	readonly isCounter: boolean
	/** The combatant whose ability is being invoked (attacker for forward, defender for counter). */
	readonly source: Combatant
	/** The combatant being hit (defender for forward, attacker for counter). */
	readonly target: Combatant
}

/**
 * Phase: a unit has just died. Hook receives the world already missing the
 * dead unit; it can apply tribe-wide cascades (hero morale) or killer effects
 * (orc_raider bloodlust).
 */
export type DeathHook = {
	readonly world: GameWorld
	readonly victim: { readonly unit: Unit; readonly pos: BoardPosition }
	readonly killer: {
		readonly unitId: Unit['id']
		readonly type: UnitType
		readonly hpBeforeKill: number
		readonly pos: BoardPosition
	}
	/**
	 * True when the death is caused by a counter-attack rather than the
	 * forward attack. Some on-death effects (e.g., orc_raider bloodlust) only
	 * fire on the forward strike to match the legacy behaviour.
	 */
	readonly isCounter: boolean
}

/**
 * Phase: combat is fully resolved (damage, counter, on-death) and the resolver
 * is about to set the attacker's mode. Hooks return a `UnitMode` to override
 * the default `'acted'`, or `null` to defer to other abilities. The first
 * non-null result in registration order wins.
 */
export type ModeAfterAttackHook = {
	readonly state: CombatState
	readonly killed: boolean
}

export type UnitAbility = {
	readonly unit: UnitType
	readonly hooks: {
		readonly preDamage?: (ctx: PreDamageHook) => PreDamageHook
		readonly onDamage?: (ctx: DamageCtx) => DamageCtx
		readonly beforeCounter?: (ctx: BeforeCounterHook) => BeforeCounterHook
		readonly postHit?: (ctx: PostHitHook) => PostHitHook
		readonly onDeath?: (ctx: DeathHook) => DeathHook
		readonly modeAfterAttack?: (ctx: ModeAfterAttackHook) => UnitMode | null
	}
}
