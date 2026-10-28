import assert from 'node:assert/strict'
// oxlint-disable-next-line vitest/no-import-node-test -- The isolated npm fixture runs without the workspace Vitest or Effect runtime.
import { test } from 'node:test'
import { Machine } from '@typeonce/effect-machine'
import { Effect, Option, Result } from 'effect'
import { Connection, Events, initial, plan, Root } from './planner.ts'

function disconnected() {
	return plan(initial(), Events.Disconnect({ deadline: 100 }))
}

await test('disconnect stores an absolute deadline and repeated disconnect does not extend it', () => {
	const state = disconnected()
	assert.ok(Root.matches(state, 'Disconnected'))
	assert.equal(Option.getOrThrow(Root.get(state, 'Disconnected')).deadline, 100)
	assert.equal(plan(state, Events.Disconnect({ deadline: 200 })), state)
})

await test('early alarms preserve identity and expiry transitions only once', () => {
	const state = disconnected()
	assert.equal(plan(state, Events.Expire({ now: 99 })), state)
	const expired = plan(state, Events.Expire({ now: 100 }))
	assert.ok(Root.matches(expired, 'Forfeited'))
	assert.equal(plan(expired, Events.Expire({ now: 101 })), expired)
	assert.ok(Root.matches(plan(state, Events.Expire({ now: 200 })), 'Forfeited'))
})

await test('reconnect cancels forfeiture and a later disconnect uses a new deadline', () => {
	const connected = plan(disconnected(), Events.Reconnect())
	assert.ok(Root.matches(connected, 'Connected'))
	assert.equal(plan(connected, Events.Expire({ now: 100 })), connected)
	const next = plan(connected, Events.Disconnect({ deadline: 300 }))
	assert.ok(Root.matches(next, 'Disconnected'))
	assert.equal(Option.getOrThrow(Root.get(next, 'Disconnected')).deadline, 300)
})

await test('forfeited connections cannot reconnect or restart grace', () => {
	const state = plan(disconnected(), Events.Expire({ now: 100 }))
	assert.equal(plan(state, Events.Reconnect()), state)
	assert.equal(plan(state, Events.Disconnect({ deadline: 500 })), state)
})

await test('JSON save and fresh decode retain absolute deadline and replay outcome', () => {
	const state = disconnected()
	const saved = Effect.runSync(Machine.encodeSnapshot(Connection, state))
	const json = JSON.stringify(saved)
	const restored = Effect.runSync(
		Machine.decodeSnapshot(Connection, JSON.parse(json))
	)
	assert.ok(Root.matches(restored, 'Disconnected'))
	assert.equal(
		Option.getOrThrow(Root.get(restored, 'Disconnected')).deadline,
		100
	)
	assert.equal(plan(restored, Events.Expire({ now: 99 })), restored)
	const outcome = (snapshot: typeof state) =>
		Effect.runSync(
			Machine.encodeSnapshot(
				Connection,
				plan(snapshot, Events.Expire({ now: 100 }))
			)
		)
	assert.deepEqual(outcome(restored), outcome(state))
	const invalid = Effect.runSync(
		Machine.decodeSnapshot(Connection, { invalid: true }).pipe(Effect.result)
	)
	assert.ok(Result.isFailure(invalid))
})

function rejectedPrograms() {
	// @ts-expect-error Observed time must be numeric.
	Events.Expire({ now: 'tomorrow' })
	// @ts-expect-error Disconnect requires an absolute deadline.
	Events.Disconnect({})
	// @ts-expect-error Deadline must be numeric.
	Events.Disconnect({ deadline: 'later' })
	Machine.make({ root: Root, events: Events }).handle({
		// @ts-expect-error Only declared destinations are legal.
		initial: { target: 'Unknown' }
	})
	Machine.make({ root: Root, events: Events }).handle({
		// @ts-expect-error Disconnected owns required deadline data.
		initial: { target: 'Disconnected' }
	})
}
void rejectedPrograms
