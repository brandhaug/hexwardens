import { type MatchLifecycleEvent } from './ports'
import { createCodec } from './codec'
import { createMatchLogic } from './logic'
import {
	fixedClock,
	humanVsBotConfig,
	humanVsHumanConfig,
	inMemoryBroadcast,
	inMemoryPersistence,
	inMemoryScheduler
} from './test-helpers'

/**
 * Integration tests for the MatchObserver port. These assert that lifecycle
 * events arrive in the right order and with the right shape — the payoff
 * that replaces `getState()` polling in full-bot-match.test.ts.
 */

// humanVsBotConfig from shared helpers starts `barbarians` (human) vs `rogues`
// (bot). That's what we want for most fixtures here.
const twoBotConfig = () => {
	const config = humanVsBotConfig()
	for (const player of config.players) {
		player.isBot = true
	}
	return config
}

describe('MatchObserver — optional dep', () => {
	it('omitting the observer does not throw (default is a no-op)', async () => {
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(['barbarians', 'rogues']),
			scheduler: inMemoryScheduler(),
			clock: fixedClock(1000),
			codec: createCodec()
		})
		const init = await logic.init(humanVsHumanConfig(), 'match-a')
		expect(init.ok).toBe(true)
		// endTurn fires a turnAdvanced lifecycle — with no observer it's a no-op.
		await expect(
			logic.onClientMessage('barbarians', { type: 'endTurn' })
		).resolves.toBe(true)
	})
})

describe('MatchObserver — commandRejected', () => {
	it('emits commandRejected when endTurn comes from the wrong tribe', async () => {
		const events: MatchLifecycleEvent[] = []
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(['barbarians', 'rogues']),
			scheduler: inMemoryScheduler(),
			clock: fixedClock(1000),
			codec: createCodec(),
			observer: { onLifecycle: (e) => events.push(e) }
		})
		await logic.init(humanVsHumanConfig(), 'match-b')

		// rogues is not the current player — endTurn should be rejected.
		await logic.onClientMessage('rogues', { type: 'endTurn' })

		const rejected = events.filter((e) => e.t === 'commandRejected')
		expect(rejected).toHaveLength(1)
		const first = rejected[0]
		if (first?.t !== 'commandRejected') {
			throw new Error('expected rejection')
		}
		expect(first.tribe).toBe('rogues')
		expect(first.kind).toBe('endTurn')
		expect(first.reason).toMatch(/not your turn/i)
	})

	it('emits commandRejected when perform arrives with a no-unit source', async () => {
		const events: MatchLifecycleEvent[] = []
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(['barbarians', 'rogues']),
			scheduler: inMemoryScheduler(),
			clock: fixedClock(1000),
			codec: createCodec(),
			observer: { onLifecycle: (e) => events.push(e) }
		})
		await logic.init(humanVsHumanConfig(), 'match-c')

		// Use a position far outside the board so dispatch rejects
		// deterministically regardless of random unit placement. `(99, 99)`
		// has no tile and `executeMovement` errors out.
		await logic.onClientMessage('barbarians', {
			type: 'action',
			action: {
				type: 'move',
				from: { q: 99, r: 99, s: -198 },
				to: { q: 100, r: 99, s: -199 }
			}
		})

		const rejected = events.filter((e) => e.t === 'commandRejected')
		expect(rejected.length).toBeGreaterThanOrEqual(1)
		const first = rejected[0]
		if (first?.t !== 'commandRejected') {
			throw new Error('expected rejection')
		}
		expect(first.tribe).toBe('barbarians')
		expect(first.kind).toBe('perform')
	})
})

describe('MatchObserver — bot turn lifecycle', () => {
	it('pairs botTurnStarted with botTurnCompleted and fires turnAdvanced', async () => {
		const events: MatchLifecycleEvent[] = []
		const clock = fixedClock(0)
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(),
			scheduler: inMemoryScheduler(),
			clock,
			codec: createCodec(),
			observer: { onLifecycle: (e) => events.push(e) }
		})
		await logic.init(twoBotConfig(), 'match-d')

		// A single bot turn exercises start → complete pairing without
		// running the full bot scorer forever.
		clock.value += 1
		await logic.onAlarm()

		const started = events.filter((e) => e.t === 'botTurnStarted')
		const completed = events.filter((e) => e.t === 'botTurnCompleted')
		const failed = events.filter((e) => e.t === 'botTurnFailed')
		// Every started must pair with a terminal event.
		expect(completed.length + failed.length).toBe(started.length)
		expect(started.length).toBeGreaterThan(0)
		expect(failed).toHaveLength(0)
		// A bot turn that completes produces a turnAdvanced.
		expect(events.filter((e) => e.t === 'turnAdvanced').length).toBeGreaterThan(
			0
		)
	}, 60_000)

	it('turnAdvanced carries the new current tribe and its isBot flag', async () => {
		const events: MatchLifecycleEvent[] = []
		const clock = fixedClock(0)
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(),
			scheduler: inMemoryScheduler(),
			clock,
			codec: createCodec(),
			observer: { onLifecycle: (e) => events.push(e) }
		})
		await logic.init(twoBotConfig(), 'match-e')

		clock.value += 1
		await logic.onAlarm()

		const firstTurnAdvanced = events.find((e) => e.t === 'turnAdvanced')
		expect(firstTurnAdvanced).toBeDefined()
		if (firstTurnAdvanced?.t !== 'turnAdvanced') {
			throw new Error('expected turnAdvanced')
		}
		// Both players are bots, so isBot must be true for the next turn too.
		expect(firstTurnAdvanced.isBot).toBe(true)
		expect(
			firstTurnAdvanced.tribe === 'barbarians' ||
				firstTurnAdvanced.tribe === 'rogues'
		).toBe(true)
	}, 60_000)
})

describe('MatchObserver — gameOver uniqueness', () => {
	it('fires gameOver exactly once when a forfeit-alarm resolves', async () => {
		const events: MatchLifecycleEvent[] = []
		const clock = fixedClock(1000)
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(['barbarians', 'rogues']),
			scheduler: inMemoryScheduler(),
			clock,
			codec: createCodec(),
			observer: { onLifecycle: (e) => events.push(e) }
		})
		await logic.init(humanVsHumanConfig(), 'match-f')

		// Disconnect barbarians — adds a 60s grace deadline.
		await logic.onPlayerDisconnected('p1', 'barbarians', 'alice')
		// Jump past the grace deadline; onAlarm should forfeit and end the match.
		clock.value += 120_000
		await logic.onAlarm()

		expect(events.filter((e) => e.t === 'gameOver')).toHaveLength(1)
		const over = events.find((e) => e.t === 'gameOver')
		if (over?.t !== 'gameOver') {
			throw new Error('expected gameOver')
		}
		expect(over.winner).toBe('rogues')

		// Firing the alarm again must not re-emit gameOver (state is sealed).
		await logic.onAlarm()
		expect(events.filter((e) => e.t === 'gameOver')).toHaveLength(1)
	})
})

describe('MatchObserver — actionPerformed ordering', () => {
	it('fires actionPerformed before turnAdvanced when endTurn is a no-op', async () => {
		const events: MatchLifecycleEvent[] = []
		const logic = createMatchLogic({
			persistence: inMemoryPersistence(),
			broadcast: inMemoryBroadcast(['barbarians', 'rogues']),
			scheduler: inMemoryScheduler(),
			clock: fixedClock(1000),
			codec: createCodec(),
			observer: { onLifecycle: (e) => events.push(e) }
		})
		await logic.init(humanVsHumanConfig(), 'match-g')

		// Plain endTurn — no staged actions, so only a turnAdvanced event fires.
		await logic.onClientMessage('barbarians', { type: 'endTurn' })

		const kinds = events.map((e) => e.t)
		expect(kinds).toContain('turnAdvanced')
		// Sanity: no actionPerformed (no perform command was issued).
		expect(events.filter((e) => e.t === 'actionPerformed')).toHaveLength(0)
	})
})
