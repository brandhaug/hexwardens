import { heroUnitTypes } from '../../domains/unit'
import { addWorldDebuff } from '../../units/world-units'
import { type UnitAbility } from './registry'

export const heroMoraleAbilities: readonly UnitAbility[] = heroUnitTypes.map(
	(heroType) => ({
		unit: heroType,
		hooks: {
			onDeath(ctx) {
				if (ctx.victim.unit.type !== heroType) {
					return ctx
				}
				for (const { unit } of ctx.world.units(ctx.victim.unit.tribe)) {
					addWorldDebuff(ctx.world, unit.id, {
						type: 'morale_loss',
						atkReduction: 1,
						turnsRemaining: 2
					})
				}
				return ctx
			}
		}
	})
)
