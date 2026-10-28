import { type UnitAbility } from './registry'

/**
 * Sprinter "Rampage": on a forward kill, the sprinter ends in `moved` mode rather
 * than `acted`, allowing it to attack another adjacent target this turn (but
 * not move again — its movement is already spent). On a non-lethal hit it
 * defers to the default `acted` outcome.
 */
export const rampageAbility: UnitAbility = {
	unit: 'sprinter',
	hooks: {
		modeAfterAttack: (ctx) => (ctx.killed ? 'moved' : null)
	}
}
