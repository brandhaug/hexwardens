import { type UnitDebuff } from '../../domains/unit'
import { addWorldDebuff } from '../../units/world-units'
import { type UnitAbility } from './registry'

const HEX_CURSE_DEBUFF: UnitDebuff = {
	type: 'hex_curse',
	atkReduction: 3,
	turnsRemaining: 2
}

export const hexCurseAbility: UnitAbility = {
	unit: 'black_knight',
	hooks: {
		postHit(ctx) {
			if (
				ctx.source.unit.type !== 'black_knight' ||
				!ctx.world.unit(ctx.target.unit.id)
			) {
				return ctx
			}
			addWorldDebuff(ctx.world, ctx.target.unit.id, HEX_CURSE_DEBUFF)
			return {
				...ctx,
				events: [
					...ctx.events,
					{
						type: 'debuff_applied',
						targetId: ctx.target.unit.id,
						debuff: HEX_CURSE_DEBUFF
					}
				]
			}
		}
	}
}
