import { beforeEach } from 'vite-plus/test'
import { Result } from 'effect'
import { type Tribe } from '../domains/tribe'
import { type MatchConfig, type ServerMessage } from '../multiplayer/types'
import {
	createTestGameState,
	createTestPlayerStates
} from '../test/game-test-helpers'
import { createCodec } from './codec'
import { createMatchLogic, type MatchLogicDeps } from './logic'
import {
	PersistenceError,
	type MatchCodec,
	type MatchObserver,
	type MatchLifecycleEvent
} from './ports'
import {
	fixedClock,
	inMemoryBroadcast,
	inMemoryPersistence,
	inMemoryScheduler
} from './test-helpers'
import { type MatchState } from './types'
import { step } from './step'

function commitGate() {
	let release: () => void = () => {
		throw new Error('Commit gate not initialized')
	}
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return { promise, resolve: () => release() }
}

function baseConfig(): MatchConfig {
	return {
		mapSize: 'small',
		turnTimerSeconds: 60,
		players: [
			{
				playerId: 'p1',
				username: 'alice',
				tribe: 'barbarians',
				isBot: false,
				botDifficulty: 'Beginner'
			},
			{
				playerId: 'p2',
				username: 'bob',
				tribe: 'rogues',
				isBot: false,
				botDifficulty: 'Beginner'
			}
		]
	}
}

function baseState(overrides: Partial<MatchState> = {}): MatchState {
	const gameState = createTestGameState({
		playerStates: createTestPlayerStates({
			barbarians: {
				id: 'player_barbarians',
				name: 'alice',
				tribe: 'barbarians',
				money: 5,
				exploration: {},
				researchedTechs: [],
				researchInProgress: null,
				isBot: false,
				difficulty: 'Beginner'
			},
			rogues: {
				id: 'player_rogues',
				name: 'bob',
				tribe: 'rogues',
				money: 5,
				exploration: {},
				researchedTechs: [],
				researchInProgress: null,
				isBot: false,
				difficulty: 'Beginner'
			}
		})
	})
	return {
		matchId: 'match-1',
		gameState,
		config: baseConfig(),
		startedAt: 0,
		dailyDate: '2026-05-05',
		playerIdToTribe: { p1: 'barbarians', p2: 'rogues' },
		turnSchedule: null,
		cleanupDeadline: null,
		disconnectedPlayers: {},
		connectionCount: 2,
		...overrides
	}
}

function setup(opts: {
	state?: MatchState | null
	connected?: Tribe[]
	codec?: MatchCodec
	now?: number
	onPersistenceError?: (e: PersistenceError) => void
	commitLocally?: (state: MatchState) => Promise<void>
	observer?: MatchObserver
}) {
	const persistence = inMemoryPersistence(opts.state ?? null)
	const broadcast = inMemoryBroadcast(opts.connected ?? [])
	const scheduler = inMemoryScheduler()
	const deps: MatchLogicDeps = {
		persistence,
		broadcast,
		scheduler,
		codec: opts.codec ?? createCodec()
	}
	if (opts.now !== undefined) {
		deps.clock = fixedClock(opts.now)
	}
	if (opts.onPersistenceError) {
		deps.onPersistenceError = opts.onPersistenceError
	}
	if (opts.commitLocally) {
		const commit = opts.commitLocally
		deps.persistence = {
			...persistence,
			async saveState(next) {
				await commit(next)
				return persistence.saveState(next)
			}
		}
	}
	if (opts.observer) {
		deps.observer = opts.observer
	}
	const logic = createMatchLogic(deps)
	return { logic, broadcast, persistence, scheduler }
}

describe('createMatchLogic — lifecycle', () => {
	it('initial state is loaded from persistence', () => {
		const state = baseState()
		const { logic } = setup({ state })
		expect(logic.getState()).toEqual(state)
	})

	it('init is a no-op when state already loaded', async () => {
		const { logic, broadcast, persistence } = setup({ state: baseState() })
		const result = await logic.init(baseConfig(), 'match-1')
		expect(result).toEqual({
			ok: true,
			status: 'already_initialized',
			matchId: 'match-1'
		})
		expect(persistence.savedStates).toHaveLength(0)
		expect(broadcast.broadcasts).toHaveLength(0)
	})

	it('init rejects empty player list', async () => {
		const { logic } = setup({ state: null })
		const result = await logic.init({ ...baseConfig(), players: [] }, 'match-1')
		expect(result).toEqual({ ok: false, error: expect.any(String) })
	})

	it('init persists, arms the scheduler, and emits the turn timer', async () => {
		const { logic, broadcast, persistence, scheduler } = setup({
			state: null,
			now: 1000
		})
		const result = await logic.init(baseConfig(), 'match-1')
		expect(result).toEqual({ ok: true, matchId: 'match-1' })
		expect(persistence.savedStates).toHaveLength(1)
		expect(scheduler.scheduled).toHaveLength(1)
		expect(broadcast.broadcasts.some((m) => m.type === 'turnTimerUpdate')).toBe(
			true
		)
	})
})

describe('createMatchLogic — message routing', () => {
	let env: ReturnType<typeof setup>
	beforeEach(() => {
		env = setup({
			state: baseState(),
			connected: ['barbarians', 'rogues'],
			now: 10_000
		})
	})

	it('endTurn from current player broadcasts state + persists + schedules alarm', async () => {
		await env.logic.onClientMessage('barbarians', { type: 'endTurn' })

		expect(
			env.broadcast.tribeSends.some((s) => s.msg.type === 'gameState')
		).toBe(true)
		expect(env.persistence.savedStates.length).toBeGreaterThan(0)
		expect(env.scheduler.scheduled.length).toBeGreaterThan(0)
	})

	it('endTurn from non-current player sends error only', async () => {
		await env.logic.onClientMessage('rogues', { type: 'endTurn' })

		const errors = env.broadcast.tribeSends.filter(
			(s) => s.tribe === 'rogues' && s.msg.type === 'error'
		)
		expect(errors).toHaveLength(1)
		// No state mutation → no persist, no scheduler arm
		expect(env.persistence.savedStates).toHaveLength(0)
		expect(env.scheduler.scheduled).toHaveLength(0)
	})

	it('malformed actionRequest missing an action fails at the raw codec boundary', async () => {
		const errors: ServerMessage[] = []

		await env.logic.onRawMessage(
			'barbarians',
			JSON.stringify({ type: 'actionRequest' }),
			(msg) => errors.push(msg)
		)

		expect(errors).toEqual([
			{ type: 'error', message: expect.stringContaining('action') }
		])
	})
})

describe('createMatchLogic — onRawMessage (codec integration)', () => {
	it('invalid JSON triggers onDecodeError without state change', async () => {
		const { logic, broadcast, persistence } = setup({
			state: baseState(),
			connected: ['barbarians']
		})
		const errors: ServerMessage[] = []

		await logic.onRawMessage('barbarians', 'not json', (msg) =>
			errors.push(msg)
		)

		expect(errors).toHaveLength(1)
		expect(errors[0]?.type).toBe('error')
		expect(broadcast.tribeSends).toHaveLength(0)
		expect(persistence.savedStates).toHaveLength(0)
	})

	it('malformed hex is rejected by codec before reaching step', async () => {
		const { logic, persistence } = setup({
			state: baseState(),
			connected: ['barbarians']
		})
		const errors: ServerMessage[] = []

		await logic.onRawMessage(
			'barbarians',
			JSON.stringify({
				type: 'actionRequest',
				action: { kind: 'collect', at: { q_idx: 0, r_idx: 0 } }
			}),
			(msg) => errors.push(msg)
		)

		expect(errors).toHaveLength(1)
		expect(persistence.savedStates).toHaveLength(0)
	})

	it('valid endTurn through raw path runs full dispatch', async () => {
		const { logic, persistence } = setup({
			state: baseState(),
			connected: ['barbarians', 'rogues'],
			now: 10_000
		})

		await logic.onRawMessage(
			'barbarians',
			JSON.stringify({ type: 'endTurn' }),
			() => {
				throw new Error('should not decode-error')
			}
		)

		expect(persistence.savedStates.length).toBeGreaterThan(0)
	})
})

describe('createMatchLogic — alarm', () => {
	it('fires turnTimeout when turn timer has elapsed', async () => {
		const initial = baseState({
			turnSchedule: { kind: 'human', deadline: 5000 }
		})
		const { logic, persistence } = setup({
			state: initial,
			connected: ['barbarians', 'rogues'],
			now: 10_000
		})

		await logic.onAlarm()

		expect(persistence.savedStates.length).toBeGreaterThan(0)
		const after = logic.getState()
		expect(after?.turnSchedule?.deadline).not.toBe(5000)
	})

	it('forfeits a disconnected player past the grace deadline', async () => {
		const initial = baseState({
			disconnectedPlayers: {
				p2: { tribe: 'rogues', username: 'bob', deadline: 5000 }
			}
		})
		const { logic, broadcast } = setup({
			state: initial,
			connected: ['barbarians'],
			now: 10_000
		})

		await logic.onAlarm()

		const forfeited = broadcast.broadcasts.find(
			(m) => m.type === 'playerForfeited'
		)
		expect(forfeited).toBeDefined()
	})
})

describe('createMatchLogic — snapshotFor', () => {
	it('returns a filtered game state for a tribe', () => {
		const { logic } = setup({
			state: baseState(),
			connected: ['barbarians']
		})

		const snap = logic.snapshotFor('barbarians')

		expect(snap?.type).toBe('gameState')
		expect(snap?.currentTurn).toBe('barbarians')
	})

	it('returns null when no state', () => {
		const { logic } = setup({ state: null })
		expect(logic.snapshotFor('barbarians')).toBeNull()
	})
})

describe('createMatchLogic — persistence errors', () => {
	it('does not apply an outgoing turn timeout after a queued end-turn commit', async () => {
		const gate = commitGate()
		const entered = commitGate()
		const clock = fixedClock(1000)
		const persistence = inMemoryPersistence(
			baseState({ turnSchedule: { kind: 'human', deadline: 2000 } })
		)
		const logic = createMatchLogic({
			persistence: {
				...persistence,
				async saveState(next) {
					entered.resolve()
					await gate.promise
					return persistence.saveState(next)
				}
			},
			broadcast: inMemoryBroadcast(),
			scheduler: inMemoryScheduler(),
			codec: createCodec(),
			clock
		})
		const submission = logic.onClientMessage('barbarians', { type: 'endTurn' })
		await entered.promise
		clock.value = 3000
		const alarm = logic.onAlarm()
		gate.resolve()
		await submission
		await alarm
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('rogues')
		expect(logic.getState()?.turnSchedule).toEqual({
			kind: 'human',
			deadline: 61_000
		})
	})

	it('restores a timed match ended by a non-current player forfeit', async () => {
		const initial = baseState({
			turnSchedule: { kind: 'human', deadline: 60_000 }
		})
		const ended = step(
			initial,
			{ kind: 'forfeit', tribe: 'rogues', username: 'bob' },
			1000
		).nextState
		expect(ended.gameState.isGameOver).toBe(true)
		expect(ended.turnSchedule).toBeNull()
		const resumed = setup({ state: ended, now: 2000 })
		expect(await resumed.logic.onConnectionOpened('p1')).toBe(true)
		await resumed.logic.onPlayerDisconnected('p1', 'barbarians', 'alice')
	})

	it('retries a lost disconnect with its original grace deadline before accepting reconnect', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		try {
			const env = setup({ state: baseState({ connectionCount: 1 }) })
			vi.spyOn(env.persistence, 'saveState').mockReturnValueOnce(
				Result.fail(
					new PersistenceError({
						operation: 'saveState',
						message: 'disk unavailable'
					})
				)
			)
			const disconnect = env.logic.onPlayerDisconnected(
				'p1',
				'barbarians',
				'alice'
			)
			expect(env.logic.getState()?.connectionCount).toBe(1)
			vi.setSystemTime(5000)
			await env.logic.onAlarm()
			await disconnect
			expect(env.logic.getState()?.connectionCount).toBe(0)
			expect(env.logic.getState()?.disconnectedPlayers.p1?.deadline).toBe(
				61_000
			)
			expect(await env.logic.onConnectionOpened('p1')).toBe(true)
			expect(env.logic.getState()?.disconnectedPlayers).toEqual({})
			expect(env.logic.getState()?.connectionCount).toBe(1)
		} finally {
			vi.useRealTimers()
		}
	})

	it('commits reconnect and connection count atomically before accepting the connection', async () => {
		const env = setup({
			state: baseState({
				connectionCount: 0,
				disconnectedPlayers: {
					p1: { tribe: 'barbarians', username: 'alice', deadline: 2000 }
				}
			}),
			now: 1000
		})
		vi.spyOn(env.persistence, 'saveState').mockReturnValueOnce(
			Result.fail(
				new PersistenceError({
					operation: 'saveState',
					message: 'disk unavailable'
				})
			)
		)
		expect(await env.logic.onConnectionOpened('p1')).toBe(false)
		expect(env.logic.getState()?.connectionCount).toBe(0)
		expect(env.logic.getState()?.disconnectedPlayers.p1).toBeDefined()
		expect(await env.logic.onConnectionOpened('p1')).toBe(true)
		expect(env.logic.getState()?.connectionCount).toBe(1)
		expect(env.logic.getState()?.disconnectedPlayers).toEqual({})
	})

	it('retries a committed cleanup after storage deletion fails and the host reloads', async () => {
		const env = setup({
			state: baseState({
				connectionCount: 0,
				cleanupDeadline: 1,
				turnSchedule: null
			}),
			now: 10_000
		})
		vi.spyOn(env.persistence, 'deleteState').mockReturnValueOnce(
			Result.fail(
				new PersistenceError({
					operation: 'deleteState',
					message: 'disk unavailable'
				})
			)
		)
		await env.logic.onAlarm()
		const saved = env.logic.getState()
		expect(saved).not.toBeNull()
		expect(saved?.execution).toBe('cleanup-pending')
		const resumed = setup({ state: saved, now: 20_000 })
		expect(await resumed.logic.onConnectionOpened('p1')).toBe(false)
		expect(resumed.logic.getState()?.connectionCount).toBe(0)
		await resumed.logic.onAlarm()
		expect(resumed.logic.getState()).toBeNull()
		expect(resumed.persistence.deleted).toBe(true)
	})

	it('terminates the bot observation when committing its result fails', async () => {
		const events: MatchLifecycleEvent[] = []
		const config = baseConfig()
		config.players[0] = {
			playerId: 'p1',
			username: 'bot',
			tribe: 'barbarians',
			isBot: true,
			botDifficulty: 'Beginner'
		}
		const env = setup({
			observer: {
				onLifecycle(event) {
					events.push(event)
					if (event.t === 'botTurnStarted') {
						env.persistence.failSaveStateOnce = true
					}
				}
			}
		})
		await env.logic.init({ ...config, seed: 7 }, 'bot-durability')
		await env.logic.onAlarm()
		expect(events.filter((event) => event.t === 'botTurnStarted')).toHaveLength(
			1
		)
		expect(events.filter((event) => event.t === 'botTurnFailed')).toEqual([
			{
				t: 'botTurnFailed',
				tribe: 'barbarians',
				turn: 1,
				reason: 'persistence_failed'
			}
		])
		expect(
			events.filter((event) => event.t === 'botTurnCompleted')
		).toHaveLength(0)
	})

	it.each(['pending', 'committed'])(
		'does not publish a %s local commit after its owner is disposed',
		async (phase) => {
			const gate = commitGate()
			const { logic, broadcast } = setup({
				state: baseState(),
				connected: ['barbarians'],
				commitLocally: () => gate.promise
			})
			const pending = logic.onClientMessage('barbarians', { type: 'endTurn' })
			await Promise.resolve()
			if (phase === 'committed') {
				gate.resolve()
				for (
					let tick = 0;
					tick < 100 &&
					logic.getState()?.gameState.currentPlayerTribe === 'barbarians';
					tick++
				) {
					// Stop at the first committed projection before publication resumes.
					await Promise.resolve()
				}
			}
			expect(logic.getState()?.gameState.currentPlayerTribe).toBe(
				phase === 'pending' ? 'barbarians' : 'rogues'
			)
			logic.dispose()
			gate.resolve()
			await pending
			expect(broadcast.tribeSends).toEqual([])
			expect(broadcast.broadcasts).toEqual([])
			expect(logic.getState()?.gameState.currentPlayerTribe).toBe(
				phase === 'pending' ? 'barbarians' : 'rogues'
			)
		}
	)

	it('keeps an expired disconnect retryable when its forfeit cannot be committed', async () => {
		const { logic, persistence } = setup({
			state: baseState({
				disconnectedPlayers: {
					p2: { tribe: 'rogues', username: 'bob', deadline: 1 }
				}
			}),
			now: 10_000
		})
		persistence.failSaveStateOnce = true
		await logic.onAlarm()
		expect(logic.getState()?.disconnectedPlayers.p2).toBeDefined()
		expect(logic.getState()?.gameState.eliminatedTribes).not.toContain('rogues')
		await logic.onAlarm()
		expect(logic.getState()?.disconnectedPlayers.p2).toBeUndefined()
		expect(logic.getState()?.gameState.eliminatedTribes).toContain('rogues')
	})

	it('waits for asynchronous local durability before publishing and serializes queued commands', async () => {
		const gate = commitGate()
		const written: MatchState[] = []
		const { logic, broadcast } = setup({
			state: baseState(),
			connected: ['barbarians', 'rogues'],
			commitLocally: async (next) => {
				await gate.promise
				written.push(next)
			}
		})
		const first = logic.onClientMessage('barbarians', { type: 'endTurn' })
		const second = logic.onClientMessage('rogues', { type: 'endTurn' })
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('barbarians')
		expect(broadcast.tribeSends).toEqual([])
		gate.resolve()
		await Promise.all([first, second])
		expect(written).toHaveLength(2)
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('barbarians')
	})

	it('rolls back asynchronous failed writes and permits retry', async () => {
		let fail = true
		const { logic, broadcast } = setup({
			state: baseState(),
			connected: ['barbarians'],
			commitLocally: () =>
				fail ? Promise.reject(new Error('quota')) : Promise.resolve()
		})
		await logic.onClientMessage('barbarians', { type: 'endTurn' })
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('barbarians')
		expect(broadcast.tribeSends).toEqual([
			{
				tribe: 'barbarians',
				msg: {
					type: 'actionResult',
					success: false,
					message: 'The action could not be saved. Try again.'
				}
			}
		])
		fail = false
		await logic.onClientMessage('barbarians', { type: 'endTurn' })
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('rogues')
	})

	it('awaits local initialization before exposing a playable match', async () => {
		const gate = commitGate()
		const { logic, broadcast, scheduler } = setup({
			commitLocally: () => gate.promise
		})
		const ready = logic.init(baseConfig(), 'durable')
		expect(logic.getState()).toBeNull()
		expect(broadcast.broadcasts).toEqual([])
		expect(scheduler.scheduled).toEqual([])
		gate.resolve()
		const initialized = await ready
		expect(initialized.ok).toBe(true)
		expect(logic.getState()?.matchId).toBe('durable')
	})

	it('reports saveState failures via onPersistenceError', async () => {
		const errors: PersistenceError[] = []
		const { logic, persistence } = setup({
			state: baseState(),
			connected: ['barbarians', 'rogues'],
			now: 10_000,
			onPersistenceError: (e) => errors.push(e)
		})
		persistence.failSaveStateOnce = true

		await logic.onClientMessage('barbarians', { type: 'endTurn' })

		expect(errors).toHaveLength(1)
		expect(errors[0]?.operation).toBe('saveState')
	})

	it('keeps the committed state and publishes no candidate effects when persistence fails', async () => {
		const { logic, persistence, broadcast, scheduler } = setup({
			state: baseState(),
			connected: ['barbarians', 'rogues'],
			now: 10_000
		})
		persistence.failSaveStateOnce = true

		await logic.onClientMessage('barbarians', { type: 'endTurn' })

		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('barbarians')
		expect(broadcast.broadcasts).toEqual([])
		expect(broadcast.tribeSends).toEqual([
			{
				tribe: 'barbarians',
				msg: {
					type: 'actionResult',
					success: false,
					message: 'The action could not be saved. Try again.'
				}
			}
		])
		expect(scheduler.scheduled).toEqual([11_000])
		await logic.onClientMessage('barbarians', { type: 'endTurn' })
		expect(logic.getState()?.gameState.currentPlayerTribe).toBe('rogues')
	})

	it('replies with a rejection when a client command cannot be persisted', async () => {
		const { logic, persistence, broadcast } = setup({ now: 0 })
		await logic.init(
			{ ...baseConfig(), seed: 42, turnTimerSeconds: null },
			'failed-command'
		)
		const before = logic.getState()
		broadcast.tribeSends.length = 0
		persistence.failSaveStateOnce = true
		const committed = await logic.onClientMessage('barbarians', {
			type: 'endTurn'
		})
		expect(committed).toBe(false)
		expect(logic.getState()).toBe(before)
		expect(broadcast.tribeSends).toContainEqual({
			tribe: 'barbarians',
			msg: {
				type: 'actionResult',
				success: false,
				message: 'The action could not be saved. Try again.'
			}
		})
	})

	it('restores the future committed deadline after an early persistence retry', async () => {
		const { logic, persistence, scheduler } = setup({ now: 0 })
		await logic.init({ ...baseConfig(), seed: 42 }, 'future-deadline')
		persistence.failSaveStateOnce = true
		await logic.onClientMessage('barbarians', { type: 'endTurn' })
		expect(scheduler.scheduled).toEqual([60_000, 1000])
		await logic.onAlarm()
		expect(scheduler.scheduled.at(-1)).toBe(60_000)
	})

	it('does not initialize or arm timers until the initial save succeeds', async () => {
		const { logic, persistence, broadcast, scheduler } = setup({})
		persistence.failSaveStateOnce = true
		const initial = await logic.init(baseConfig(), 'first')
		expect(initial.ok).toBe(false)
		expect(logic.getState()).toBeNull()
		expect(broadcast.broadcasts).toEqual([])
		expect(scheduler.scheduled).toEqual([])
		expect(await logic.init(baseConfig(), 'retry')).toEqual({
			ok: true,
			matchId: 'retry'
		})
	})

	it('persists a checkpoint that resumes the same turn and deadline', async () => {
		const { logic, persistence } = setup({ state: baseState(), now: 10_000 })
		await logic.onClientMessage('barbarians', { type: 'endTurn' })
		const saved = persistence.savedStates.at(-1)
		if (!saved) {
			throw new Error('Expected persisted match')
		}
		expect(saved.execution).toBeUndefined()
		expect(saved).not.toHaveProperty('orchestration')
		const resumed = setup({ state: saved, now: 20_000 })
		await resumed.logic.init(baseConfig(), 'ignored')
		expect(resumed.logic.getState()?.gameState.currentPlayerTribe).toBe(
			'rogues'
		)
		expect(resumed.scheduler.scheduled.at(-1)).toBe(70_000)
		await resumed.logic.onClientMessage('rogues', { type: 'endTurn' })
		expect(resumed.logic.getState()?.gameState.currentPlayerTribe).toBe(
			'barbarians'
		)
	})

	it('reports saveMatchResult failures via onPersistenceError', async () => {
		const errors: PersistenceError[] = []
		// Start with rogues already eliminated so forfeiting barbarians ends the game.
		const initial = baseState({
			gameState: {
				...baseState().gameState,
				eliminatedTribes: ['rogues']
			},
			disconnectedPlayers: {
				p1: { tribe: 'barbarians', username: 'alice', deadline: 5000 }
			}
		})
		const { logic, persistence } = setup({
			state: initial,
			connected: [],
			now: 10_000,
			onPersistenceError: (e) => errors.push(e)
		})
		persistence.failSaveMatchResultOnce = true

		await logic.onAlarm()

		// Flush the saveMatchResult microtask.
		await Promise.resolve()
		await Promise.resolve()

		expect(errors.some((e) => e.operation === 'saveMatchResult')).toBe(true)
	})
})

describe('createMatchLogic — scheduler', () => {
	it('arms the cleanup deadline after game over rather than obsolete reconnect timers', async () => {
		const base = baseState()
		const { logic, scheduler } = setup({
			state: {
				...base,
				gameState: {
					...base.gameState,
					isGameOver: true,
					winner: 'barbarians'
				},
				turnSchedule: null,
				connectionCount: 0,
				disconnectedPlayers: {
					p2: { tribe: 'rogues', username: 'bob', deadline: 20 }
				},
				cleanupDeadline: 1000
			}
		})
		await logic.init(baseConfig(), 'ignored')
		expect(scheduler.scheduled.at(-1)).toBe(1000)
	})

	it('arms scheduler at earliest deadline after a state-changing command', async () => {
		const { logic, scheduler } = setup({
			state: baseState(),
			connected: ['barbarians', 'rogues'],
			now: 10_000
		})

		await logic.onClientMessage('barbarians', { type: 'endTurn' })

		// endTurn starts a 60s timer → expected deadline = 10_000 + 60_000
		expect(scheduler.scheduled.at(-1)).toBe(70_000)
	})

	it('cancels scheduler when no deadlines remain', async () => {
		const state = baseState({
			config: { ...baseConfig(), turnTimerSeconds: null }
		})
		const { logic, scheduler } = setup({
			state,
			connected: ['barbarians', 'rogues'],
			now: 10_000
		})

		await logic.onClientMessage('barbarians', { type: 'endTurn' })

		expect(scheduler.cancels).toBeGreaterThan(0)
	})
})
