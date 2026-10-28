import { type UnitAbility } from './registry'

export const mirageAbility: UnitAbility = {
	unit: 'skeleton_golem',
	hooks: {
		preDamage(ctx) {
			const { state, world } = ctx
			if (
				state.defender.unit.type !== 'skeleton_golem' ||
				state.defender.state.hasBeenAttackedThisTurn
			) {
				return ctx
			}
			world.updateUnit(state.attacker.unit.id, { mode: 'acted' })
			world.updateUnit(state.defender.unit.id, {
				hasBeenAttackedThisTurn: true
			})
			return {
				...ctx,
				dodged: true,
				message: `Skeleton Golem's Mirage deflected the attack!`,
				events: [
					...ctx.events,
					{ type: 'dodge', unitId: state.defender.unit.id, context: 'attack' }
				]
			}
		},
		onDamage(ctx) {
			if (ctx.state.defender.unit.type === 'skeleton_golem') {
				ctx.world.updateUnit(ctx.state.defender.unit.id, {
					hasBeenAttackedThisTurn: true
				})
			}
			return ctx
		},
		beforeCounter(ctx) {
			if (ctx.target.unit.type !== 'skeleton_golem') {
				return ctx
			}
			const target = ctx.world.unit(ctx.target.unit.id)
			if (!target || target.state.hasBeenAttackedThisTurn) {
				return ctx
			}
			ctx.world.updateUnit(target.unit.id, { hasBeenAttackedThisTurn: true })
			return {
				...ctx,
				events: [
					...ctx.events,
					{ type: 'dodge', unitId: target.unit.id, context: 'counter' }
				]
			}
		}
	}
}
