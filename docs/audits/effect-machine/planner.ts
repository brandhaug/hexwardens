import { Machine } from '@typeonce/effect-machine'
import { Effect, Schema } from 'effect'

export const Root = Machine.state({
	states: {
		Connected: {},
		Disconnected: { fields: { deadline: Schema.Number } },
		Forfeited: {}
	}
})
export const Events = Machine.events({
	Disconnect: { deadline: Schema.Number },
	Reconnect: {},
	Expire: { now: Schema.Number }
})
export const Connection = Machine.make({ root: Root, events: Events }).handle({
	initial: { target: 'Connected' },
	states: {
		Connected: {
			on: {
				Disconnect: {
					target: 'Disconnected',
					data: ({ event }) => ({ deadline: event.deadline })
				}
			}
		},
		Disconnected: {
			on: {
				Reconnect: { target: 'Connected' },
				Expire: {
					target: 'Forfeited',
					guard: ({ state, event }) => event.now >= state.deadline
				}
			}
		},
		Forfeited: {}
	}
})

export function initial() {
	return Effect.runSync(Machine.planInitial(Connection)).state
}

export function plan(
	state: ReturnType<typeof initial>,
	event: Machine.Machine.EventInput<Machine.Machine.Event<typeof Connection>>
) {
	const result = Effect.runSync(Machine.plan(Connection, state, event))
	// The planner reconstructs snapshots even for ignored events. Preserve the
	// engine's identity-based persistence convention at this experiment's seam.
	if (result.microsteps.some((step) => step.changed)) {
		return result.next
	}
	return state
}
