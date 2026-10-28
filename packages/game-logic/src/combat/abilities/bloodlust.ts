import { getEffectiveMaxHealth } from '../../domains/unit'
import { type UnitAbility } from './registry'

export const bloodlustAbility: UnitAbility = {
	unit: 'orc_raider',
	hooks: {
		onDeath(ctx) {
			if (ctx.isCounter || ctx.killer.type !== 'orc_raider') {
				return ctx
			}
			const killer = ctx.world.unit(ctx.killer.unitId)
			if (killer) {
				ctx.world.updateUnit(killer.unit.id, {
					health: Math.min(
						getEffectiveMaxHealth('orc_raider', killer.state),
						ctx.killer.hpBeforeKill + 5
					)
				})
			}
			return ctx
		}
	}
}
