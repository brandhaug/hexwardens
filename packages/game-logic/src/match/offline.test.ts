import { vi } from 'vite-plus/test'
import { delayPacer } from '../bot/bot-pacer'
import {
	createOfflineMatch,
	SpectatorActionError,
	type OfflineMatchHandle
} from './offline'
import { type MatchLifecycleEvent } from './ports'
import { step } from './step'
import { allBotConfig, humanVsBotConfig } from './test-helpers'

describe('createOfflineMatch', () => {
	it('retains completed results while mounted and after resuming beyond cleanup', async () => {
		vi.useFakeTimers()
		let match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await match.ready()
			const ended = step(
				match.getState(),
				{ kind: 'forfeit', tribe: 'barbarians', username: 'Alice' },
				Date.now()
			).nextState
			match.destroy()
			match = createOfflineMatch({
				config: humanVsBotConfig(),
				playerTribe: 'barbarians',
				initialState: ended
			})
			await match.ready()
			expect(match.getState().gameState.isGameOver).toBe(true)
			await vi.advanceTimersByTimeAsync(11 * 60 * 1000)
			await match.drain()
			const completed = match.getState()
			match.destroy()
			match = createOfflineMatch({
				config: humanVsBotConfig(),
				playerTribe: 'barbarians',
				initialState: completed
			})
			await match.ready()
			await vi.advanceTimersByTimeAsync(1)
			await match.drain()
			expect(match.getState().gameState.isGameOver).toBe(true)
		} finally {
			match.destroy()
			vi.useRealTimers()
		}
	})

	it('rejects endTurn when its local commit fails', async () => {
		let fail = false
		const match = createOfflineMatch({
			config: { ...humanVsBotConfig(), seed: 42 },
			playerTribe: 'barbarians',
			commitLocally: () => {
				return fail ? Promise.reject(new Error('quota')) : Promise.resolve()
			}
		})
		try {
			await match.ready()
			fail = true
			const before = match.getState()
			await expect(match.endTurn()).rejects.toMatchObject({
				_tag: 'PersistenceError'
			})
			expect(match.getState()).toBe(before)
		} finally {
			match.destroy()
		}
	})

	it('rearms a consumed bot wake after a transient local persistence failure', async () => {
		vi.useFakeTimers()
		let commits = 0
		const match = createOfflineMatch({
			config: { ...humanVsBotConfig(), seed: 42 },
			playerTribe: 'barbarians',
			botPacer: delayPacer(20, 20),
			commitLocally: () => {
				commits++
				return commits === 5
					? Promise.reject(new Error('quota'))
					: Promise.resolve()
			}
		})
		try {
			await match.ready()
			await match.endTurn()
			await vi.advanceTimersByTimeAsync(5000)
			expect(commits).toBeGreaterThan(5)
			expect(match.getState().gameState.currentPlayerTribe).toBe('barbarians')
		} finally {
			match.destroy()
			vi.useRealTimers()
		}
	})

	it('returns a handle with an initialized MatchState after ready', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await match.ready()
			const state = match.getState()
			expect(state.gameState.turn).toBe(1)
			expect(state.gameState.currentPlayerTribe).toBe('barbarians')
			expect(Object.keys(state.gameState.playerStates).toSorted()).toEqual([
				'barbarians',
				'rogues'
			])
		} finally {
			match.destroy()
		}
	})

	it('initializes units for the exact configured bot tribes', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians',
			now: () => 0
		})
		try {
			await match.ready()
			const state = match.getState().gameState
			const unitTribes = new Set(
				Object.values(state.units.unitStates).map((unitState) => {
					const tile =
						state.units.board[unitState.position.r_idx]?.[
							unitState.position.q_idx
						]
					return tile?.unit?.tribe
				})
			)

			expect(unitTribes.has('barbarians')).toBe(true)
			expect(unitTribes.has('rogues')).toBe(true)
		} finally {
			match.destroy()
		}
	})

	it('can resume from a stored MatchState', async () => {
		const original = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians',
			matchId: 'stored-match'
		})
		await original.ready()
		const stored = original.getState()
		original.destroy()

		const resumed = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians',
			initialState: stored
		})
		try {
			await resumed.ready()
			const state = resumed.getState()
			expect(state.matchId).toBe('stored-match')
			expect(state.gameState.turn).toBe(stored.gameState.turn)
		} finally {
			resumed.destroy()
		}
	})

	it('ready resolves before the first getState can be read', async () => {
		const match = createOfflineMatch({
			config: allBotConfig(),
			playerTribe: null
		})
		try {
			await match.ready()
			expect(() => match.getState()).not.toThrow()
		} finally {
			match.destroy()
		}
	})

	it('fires subscribers on state change and stops after unsubscribe', async () => {
		const match = createOfflineMatch({
			config: allBotConfig(),
			playerTribe: null,
			now: () => 0
		})
		try {
			await match.ready()
			let fireCount = 0
			const unsubscribe = match.subscribe(() => {
				fireCount++
			})

			// Drive a couple of bot turns via the handle's drain helper. Cap
			// maxSteps so the pump returns promptly — bot turns re-arm at
			// `deadline: now()` which stays pinned via the injected clock.
			await match.drain({ maxSteps: 4 })
			const firedBefore = fireCount
			expect(firedBefore).toBeGreaterThan(0)

			unsubscribe()
			const afterUnsubscribeBaseline = fireCount
			await match.drain({ maxSteps: 4 })
			// No fires after unsubscribe — the listener was detached.
			expect(fireCount).toBe(afterUnsubscribeBaseline)
		} finally {
			match.destroy()
		}
	})

	it('subscribers read the saved state during a state-change callback', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians',
			now: () => 0
		})
		try {
			await match.ready()
			const observedTurns: string[] = []
			const unsubscribe = match.subscribe(() => {
				observedTurns.push(match.getState().gameState.currentPlayerTribe)
			})

			await match.endTurn()
			unsubscribe()

			expect(observedTurns).toContain('rogues')
		} finally {
			match.destroy()
		}
	})

	it('drives an all-bot match forward via drain() with an advancing clock', async () => {
		const events: MatchLifecycleEvent[] = []
		const now = { value: 0 }
		const match = createOfflineMatch({
			config: allBotConfig(),
			playerTribe: null,
			now: () => now.value,
			observer: { onLifecycle: (e) => events.push(e) }
		})
		try {
			await match.ready()
			// Pump turns in small batches with a ticking clock. Each drain
			// dispatches at most a handful of bot turns before returning; we
			// advance time so the next `{ kind: 'bot', deadline: now }` is due
			// on the following iteration.
			const TARGET_TURN = 5
			const MAX_ITERATIONS = 200
			let iterations = 0
			while (iterations < MAX_ITERATIONS) {
				const state = match.getState()
				if (state.gameState.isGameOver) {
					break
				}
				if (events.some((e) => e.t === 'gameOver')) {
					break
				}
				if (state.gameState.turn >= TARGET_TURN) {
					break
				}
				now.value += 1
				await match.drain({ maxSteps: 32 })
				iterations++
			}

			const turnAdvanced = events.filter((e) => e.t === 'turnAdvanced').length
			expect(turnAdvanced).toBeGreaterThan(0)
			expect(events.filter((e) => e.t === 'botTurnFailed')).toEqual([])
			expect(match.getState().gameState.turn).toBeGreaterThanOrEqual(1)
		} finally {
			match.destroy()
		}
	}, 30_000)

	it('rejects send / endTurn in spectator mode', async () => {
		const match = createOfflineMatch({
			config: allBotConfig(),
			playerTribe: null
		})
		try {
			await match.ready()
			expect(() => match.send({ type: 'endTurn' })).toThrow(
				SpectatorActionError
			)
			expect(() => match.endTurn()).toThrow(SpectatorActionError)
		} finally {
			match.destroy()
		}
	})

	it('canAct: false in spectator, true otherwise, false after destroy', async () => {
		const spectator = createOfflineMatch({
			config: allBotConfig(),
			playerTribe: null
		})
		await spectator.ready()
		expect(spectator.canAct()).toBe(false)
		spectator.destroy()
		expect(spectator.canAct()).toBe(false)

		const playable = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await playable.ready()
			expect(playable.canAct()).toBe(true)
		} finally {
			playable.destroy()
			expect(playable.canAct()).toBe(false)
		}
	})

	it('destroy() cancels pending timers and clears listeners', async () => {
		vi.useFakeTimers()
		try {
			let callCount = 0
			const match: OfflineMatchHandle = createOfflineMatch({
				config: allBotConfig(),
				playerTribe: null,
				now: () => 0
			})
			await match.ready()
			match.subscribe(() => {
				callCount++
			})
			const before = callCount
			match.destroy()
			// Run all remaining timers. Nothing should fire after destroy().
			vi.runAllTimers()
			expect(callCount).toBe(before)
		} finally {
			vi.useRealTimers()
		}
	})

	it('endTurn routes through the match logic for human players', async () => {
		const events: MatchLifecycleEvent[] = []
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians',
			now: () => 0,
			observer: { onLifecycle: (event) => events.push(event) }
		})
		try {
			await match.ready()
			const before = match.getState().gameState.currentPlayerTribe
			expect(before).toBe('barbarians')
			await match.endTurn()
			// After human end-turn the logic rotates to the bot. Drain to settle.
			await match.drain()
			const completed = events.find(
				(event) => event.t === 'botTurnCompleted' && event.tribe === 'rogues'
			)
			// In a 2-player match, after the bot finishes its turn we're back
			// on 'barbarians'. `turn` may or may not have incremented depending on
			// rotation wrap — we just assert no crash and state advanced.
			if (completed?.t !== 'botTurnCompleted') {
				throw new Error('expected botTurnCompleted')
			}
			expect(completed.actionCount).toBeGreaterThan(0)
			expect(match.getState().gameState.turn).toBeGreaterThanOrEqual(1)
		} finally {
			match.destroy()
		}
	}, 15_000)

	it('accumulates a chronicle as turn-pipeline events fire', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await match.ready()
			expect(match.getChronicle().entries).toEqual([])
			await match.endTurn()
			await match.drain({ maxSteps: 16 })

			const chronicle = match.getChronicle()
			// At minimum, the human end-turn rotates to the bot — so a
			// `turnAdvanced` entry must land. Seq ids must be strictly
			// monotonic.
			expect(chronicle.entries.length).toBeGreaterThan(0)
			expect(chronicle.entries.some((e) => e.kind === 'turnAdvanced')).toBe(
				true
			)
			const seqs = chronicle.entries.map((e) => e.seq)
			expect(seqs).toEqual([...seqs].toSorted((a, b) => a - b))
		} finally {
			match.destroy()
		}
	}, 15_000)

	it('chains the user-supplied observer with the chronicle accumulator', async () => {
		const events: MatchLifecycleEvent[] = []
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians',
			observer: { onLifecycle: (e) => events.push(e) }
		})
		try {
			await match.ready()
			await match.endTurn()
			await match.drain({ maxSteps: 16 })
			// User observer still receives lifecycle events alongside the
			// internal chronicle accumulator.
			expect(events.length).toBeGreaterThan(0)
			expect(events.some((e) => e.t === 'turnAdvanced')).toBe(true)
		} finally {
			match.destroy()
		}
	}, 15_000)
})
