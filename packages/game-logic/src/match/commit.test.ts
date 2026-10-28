import { Result } from 'effect'
import { createCodec } from './codec'
import { createMatchLogic } from './logic'
import { createInitialMatchState } from './init'
import {
	humanVsHumanConfig,
	inMemoryBroadcast,
	inMemoryPersistence,
	inMemoryScheduler,
	fixedClock
} from './test-helpers'
import { type MatchState } from './types'

function gate() {
	let release: () => void = () => {
		throw new Error('Gate not initialized')
	}
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return { promise, release: () => release() }
}

describe('serialized durable match commits', () => {
	it.each([false, true])(
		'shares concurrent initialization and respects disposal before publication: %s',
		async (disposeAfterCommit) => {
			const pending = gate()
			const entered = gate()
			const writes: MatchState[] = []
			const persistence = inMemoryPersistence()
			const broadcast = inMemoryBroadcast()
			const scheduler = inMemoryScheduler()
			const logic = createMatchLogic({
				persistence: {
					...persistence,
					async saveState(next) {
						entered.release()
						await pending.promise
						writes.push(next)
						return persistence.saveState(next)
					}
				},
				broadcast,
				scheduler: {
					...scheduler,
					scheduleAt(at) {
						scheduler.scheduleAt(at)
						if (disposeAfterCommit) {
							void Promise.resolve().then(() => logic.dispose())
						}
					}
				},
				codec: createCodec(),
				clock: fixedClock(1000)
			})
			const first = logic.init(humanVsHumanConfig(), 'first')
			const duplicate = logic.init(humanVsHumanConfig(), 'second')
			await entered.promise
			expect(logic.getState()).toBeNull()
			expect(broadcast.broadcasts).toEqual([])
			expect(scheduler.scheduled).toEqual([])
			pending.release()
			const initial = await first
			expect(initial.ok).toBe(!disposeAfterCommit)
			expect(await duplicate).toEqual(initial)
			expect(broadcast.broadcasts).toHaveLength(disposeAfterCommit ? 0 : 1)
			expect(writes).toHaveLength(1)
			expect(logic.getState()?.matchId).toBe('first')
		}
	)

	it('recovers the command queue after a rejected persistence promise', async () => {
		const created = createInitialMatchState(
			'commit',
			{ ...humanVsHumanConfig(), seed: 7 },
			1000
		)
		assert(Result.isSuccess(created))
		const persistence = inMemoryPersistence(created.success)
		let fail = true
		const broadcast = inMemoryBroadcast(['barbarians', 'rogues'])
		const logic = createMatchLogic({
			persistence: {
				...persistence,
				async saveState(next) {
					if (fail) {
						throw new Error('quota')
					}
					return persistence.saveState(next)
				}
			},
			broadcast,
			scheduler: inMemoryScheduler(),
			codec: createCodec(),
			clock: fixedClock(1000)
		})
		expect(await logic.onClientMessage('barbarians', { type: 'endTurn' })).toBe(
			false
		)
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('barbarians')
		expect(
			broadcast.tribeSends.every(
				({ msg }) => msg.type === 'actionResult' && !msg.success
			)
		).toBe(true)
		fail = false
		expect(await logic.onClientMessage('barbarians', { type: 'endTurn' })).toBe(
			true
		)
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('rogues')
	})
})
