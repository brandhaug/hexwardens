import {
	requireTestValue,
	createTestGameState,
	createTestPlayerStates
} from '../test/game-test-helpers'
import { describe, expect, it } from 'vite-plus/test'
import { type MatchConfig } from '../multiplayer/types'
import { step } from './step'
import { type DisconnectInfo, type MatchEffect, type MatchState } from './types'

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

function effectKinds(effects: MatchEffect[]): MatchEffect['t'][] {
	return effects.map((e) => e.t)
}

describe('step — perform', () => {
	it('rejects perform when not current player', () => {
		const state = baseState()
		const { nextState, effects } = step(
			state,
			{
				kind: 'perform',
				tribe: 'rogues',
				intent: {
					kind: 'move',
					from: { q_idx: 0, r_idx: 0 },
					to: { q_idx: 1, r_idx: 0 }
				}
			},
			1000
		)

		expect(nextState).toBe(state)
		expect(effects).toHaveLength(1)
		const effect = effects[0]
		expect(effect?.t).toBe('messageToTribe')
		if (effect?.t !== 'messageToTribe') {
			throw new Error('expected messageToTribe')
		}
		expect(effect.tribe).toBe('rogues')
		expect(effect.msg.type).toBe('error')
	})

	it('rejects perform when game is over', () => {
		const state = baseState({
			gameState: {
				...baseState().gameState,
				isGameOver: true,
				winner: 'barbarians'
			}
		})
		const { effects } = step(
			state,
			{
				kind: 'perform',
				tribe: 'barbarians',
				intent: {
					kind: 'move',
					from: { q_idx: 0, r_idx: 0 },
					to: { q_idx: 1, r_idx: 0 }
				}
			},
			1000
		)

		expect(effects).toHaveLength(1)
		const effect = effects[0]
		if (effect?.t !== 'messageToTribe') {
			throw new Error('expected messageToTribe')
		}
		expect(effect.msg.type).toBe('error')
		if (effect.msg.type !== 'error') {
			throw new Error('expected error msg')
		}
		expect(effect.msg.message).toBe('Game is over')
	})
})

describe('step — endTurn', () => {
	it('rejects endTurn when not current player', () => {
		const state = baseState()
		const { nextState, effects } = step(
			state,
			{ kind: 'endTurn', tribe: 'rogues' },
			1000
		)
		expect(nextState).toBe(state)
		expect(effects).toHaveLength(1)
		expect(effects[0]?.t).toBe('messageToTribe')
	})

	it('advances turn for human player and starts the timer', () => {
		const state = baseState()
		const { nextState, effects } = step(
			state,
			{ kind: 'endTurn', tribe: 'barbarians' },
			1000
		)

		expect(nextState.gameState.currentPlayerTribe).toBe('rogues')
		expect(nextState.turnSchedule).toEqual({
			kind: 'human',
			deadline: 1000 + 60 * 1000
		})
		expect(effectKinds(effects)).toEqual([
			'stateChanged',
			'broadcast',
			'broadcast',
			'log',
			'broadcast'
		])
		expect(effects[2]).toMatchObject({
			t: 'broadcast',
			msg: {
				type: 'chronicleEntries',
				entries: [{ kind: 'turnAdvanced', actorTribe: 'rogues', turn: 1 }]
			}
		})
		expect(effects[3]).toMatchObject({
			t: 'log',
			event: 'turn_advanced',
			data: { tribe: 'rogues', isBot: false }
		})
	})

	it('omits turnTimerUpdate when config.turnTimerSeconds is null', () => {
		const state = baseState({
			config: { ...baseConfig(), turnTimerSeconds: null }
		})
		const { nextState, effects } = step(
			state,
			{ kind: 'endTurn', tribe: 'barbarians' },
			5000
		)

		expect(nextState.turnSchedule).toBeNull()
		expect(effectKinds(effects)).toEqual([
			'stateChanged',
			'broadcast',
			'broadcast',
			'log'
		])
	})
})

describe('step — forfeit', () => {
	it('adds tribe to eliminated list and broadcasts forfeit', () => {
		const state = baseState()
		const { nextState, effects } = step(
			state,
			{ kind: 'forfeit', tribe: 'rogues', username: 'bob' },
			1000
		)

		expect(nextState.gameState.eliminatedTribes).toContain('rogues')
		expect(effects[0]).toEqual({
			t: 'log',
			event: 'player_forfeited',
			data: { username: 'bob', tribe: 'rogues' }
		})
		expect(effects[1]).toMatchObject({
			t: 'broadcast',
			msg: { type: 'playerForfeited', tribe: 'rogues', username: 'bob' }
		})
		expect(nextState.gameState.isGameOver).toBe(true)
		expect(nextState.gameState.winner).toBe('barbarians')
		expect(effectKinds(effects)).toContain('gameEnded')
	})

	it('advances turn when forfeiter was the current player', () => {
		const state = baseState({
			gameState: {
				...baseState().gameState,
				playerStates: {
					...baseState().gameState.playerStates,
					druids: {
						id: 'player_druids',
						name: 'carol',
						tribe: 'druids',
						money: 5,
						exploration: {},
						researchedTechs: [],
						researchInProgress: null,
						isBot: false,
						difficulty: 'Beginner'
					}
				}
			}
		})

		const { nextState, effects } = step(
			state,
			{ kind: 'forfeit', tribe: 'barbarians', username: 'alice' },
			1000
		)

		expect(nextState.gameState.currentPlayerTribe).not.toBe('barbarians')
		expect(effectKinds(effects)).toContain('stateChanged')
	})

	it('is a no-op when the tribe is already eliminated', () => {
		const state = baseState({
			gameState: {
				...baseState().gameState,
				eliminatedTribes: ['rogues']
			}
		})
		const { nextState, effects } = step(
			state,
			{ kind: 'forfeit', tribe: 'rogues', username: 'bob' },
			1000
		)

		expect(nextState).toBe(state)
		expect(effects).toHaveLength(0)
	})
})

describe('step — turnTimeout', () => {
	it('clears turn timer and advances the turn', () => {
		const state = baseState({
			turnSchedule: { kind: 'human', deadline: 500 }
		})
		const { nextState, effects } = step(state, { kind: 'turnTimeout' }, 1000)

		expect(nextState.gameState.currentPlayerTribe).toBe('rogues')
		expect(nextState.turnSchedule).toEqual({
			kind: 'human',
			deadline: 1000 + 60 * 1000
		})
		expect(effectKinds(effects)).toEqual([
			'stateChanged',
			'broadcast',
			'broadcast',
			'log',
			'broadcast'
		])
	})
})

describe('step — playerDisconnected', () => {
	it('records grace period and decrements connection count', () => {
		const state = baseState()
		const { nextState, effects } = step(
			state,
			{
				kind: 'playerDisconnected',
				playerId: 'p1',
				tribe: 'barbarians',
				username: 'alice'
			},
			1000
		)

		expect(nextState.connectionCount).toBe(1)
		const info: DisconnectInfo | undefined = nextState.disconnectedPlayers['p1']
		expect(info).toBeDefined()
		expect(info?.deadline).toBe(1000 + 60 * 1000)
		expect(nextState.turnSchedule).toEqual({
			kind: 'human',
			deadline: info?.deadline
		})
		expect(effectKinds(effects)).toEqual(['broadcast'])
	})

	it('is a no-op when game is already over', () => {
		const state = baseState({
			gameState: { ...baseState().gameState, isGameOver: true }
		})
		const { nextState, effects } = step(
			state,
			{
				kind: 'playerDisconnected',
				playerId: 'p1',
				tribe: 'barbarians',
				username: 'alice'
			},
			1000
		)

		expect(nextState.disconnectedPlayers).toEqual({})
		expect(nextState.connectionCount).toBe(1)
		expect(effects).toHaveLength(0)
	})
})

describe('step — playerReconnected', () => {
	it('removes grace entry', () => {
		const deadline = 5000
		const state = baseState({
			disconnectedPlayers: {
				p1: { tribe: 'barbarians', username: 'alice', deadline }
			}
		})
		const { nextState, effects } = step(
			state,
			{ kind: 'playerReconnected', playerId: 'p1' },
			1000
		)

		expect(nextState.disconnectedPlayers).toEqual({})
		expect(effects).toHaveLength(0)
	})

	it('is a no-op when player has no grace entry', () => {
		const state = baseState()
		const { nextState, effects } = step(
			state,
			{ kind: 'playerReconnected', playerId: 'p1' },
			1000
		)

		expect(nextState).toBe(state)
		expect(effects).toHaveLength(0)
	})
})

describe('step — connection tracking', () => {
	it('increments connection count on connectionOpened', () => {
		const state = baseState({ connectionCount: 0 })
		const { nextState, effects } = step(
			state,
			{ kind: 'connectionOpened', playerId: 'p1' },
			1000
		)
		expect(nextState.connectionCount).toBe(1)
		expect(effects).toHaveLength(0)
	})

	it('decrements connection count on connectionClosed, flooring at zero', () => {
		const state = baseState({ connectionCount: 0 })
		const { nextState } = step(
			state,
			{ kind: 'connectionClosed', playerId: 'p1' },
			1000
		)
		expect(nextState.connectionCount).toBe(0)
	})
})

describe('step — cleanup', () => {
	it('emits matchDestroyed when no connections and no disconnects', () => {
		const state = baseState({
			connectionCount: 0,
			disconnectedPlayers: {}
		})
		const { effects } = step(state, { kind: 'cleanup' }, 1000)
		expect(effects).toEqual([{ t: 'matchDestroyed' }])
	})

	it('is a no-op when connections still exist', () => {
		const state = baseState({ connectionCount: 1 })
		const { nextState, effects } = step(state, { kind: 'cleanup' }, 1000)
		expect(nextState).toBe(state)
		expect(effects).toHaveLength(0)
	})

	it('is a no-op when pending disconnects exist', () => {
		const state = baseState({
			connectionCount: 0,
			disconnectedPlayers: {
				p1: { tribe: 'barbarians', username: 'alice', deadline: 10_000 }
			}
		})
		const { effects } = step(state, { kind: 'cleanup' }, 1000)
		expect(effects).toHaveLength(0)
	})
})

describe('step — runBotTurn / botTurnResolved', () => {
	function botState(): MatchState {
		const gs = createTestGameState({
			playerStates: createTestPlayerStates({
				barbarians: {
					id: 'player_barbarians',
					name: 'bot-v',
					tribe: 'barbarians',
					money: 5,
					exploration: {},
					researchedTechs: [],
					researchInProgress: null,
					isBot: true,
					difficulty: 'Beginner'
				},
				rogues: {
					id: 'player_rogues',
					name: 'bot-s',
					tribe: 'rogues',
					money: 5,
					exploration: {},
					researchedTechs: [],
					researchInProgress: null,
					isBot: true,
					difficulty: 'Beginner'
				}
			})
		})
		return {
			matchId: 'match-bot',
			gameState: gs,
			config: {
				mapSize: 'small',
				turnTimerSeconds: null,
				players: [
					{
						playerId: 'pb1',
						username: 'bot-v',
						tribe: 'barbarians',
						isBot: true,
						botDifficulty: 'Beginner'
					},
					{
						playerId: 'pb2',
						username: 'bot-s',
						tribe: 'rogues',
						isBot: true,
						botDifficulty: 'Beginner'
					}
				]
			},
			startedAt: 0,
			dailyDate: '2026-05-05',
			playerIdToTribe: { pb1: 'barbarians', pb2: 'rogues' },
			turnSchedule: { kind: 'bot', deadline: 0 },
			cleanupDeadline: null,
			disconnectedPlayers: {},
			connectionCount: 0
		}
	}

	it('runBotTurn emits an awaitBotTurn effect and retains the durable recovery deadline', () => {
		const state = botState()
		const { nextState, effects } = step(state, { kind: 'runBotTurn' }, 100)

		expect(nextState.turnSchedule).toEqual({ kind: 'bot', deadline: 0 })
		expect(effects).toHaveLength(1)
		const eff = effects[0]
		if (eff?.t !== 'awaitBotTurn') {
			throw new Error('expected awaitBotTurn')
		}
		expect(eff.tribe).toBe('barbarians')
		expect(eff.difficulty).toBe('Beginner')
		expect(eff.gameState).toBe(state.gameState)
	})

	it('runBotTurn is a no-op when current player is not a bot', () => {
		const base = botState()
		const state: MatchState = {
			...base,
			gameState: {
				...base.gameState,
				playerStates: {
					...base.gameState.playerStates,
					barbarians: {
						...requireTestValue(base.gameState.playerStates.barbarians),
						isBot: false
					}
				}
			}
		}
		const { nextState, effects } = step(state, { kind: 'runBotTurn' }, 100)
		expect(nextState.turnSchedule).toBeNull()
		expect(effects).toHaveLength(0)
	})

	it('botTurnResolved folds intermediate + final states into effects and re-arms', () => {
		const state = botState()
		const finalState = {
			...state.gameState,
			currentPlayerTribe: 'rogues' as const,
			turn: state.gameState.turn + 1
		}
		const intermediate = {
			...state.gameState,
			turn: state.gameState.turn
		}

		const { nextState, effects } = step(
			state,
			{
				kind: 'botTurnResolved',
				tribe: 'barbarians',
				run: {
					finalState,
					intermediateStates: [intermediate]
				}
			},
			500
		)

		expect(nextState.gameState).toBe(finalState)
		// One stateChanged per intermediate + one for the final state, plus a
		// turn_advanced log from scheduleAfterTurnChange, plus a bot schedule.
		expect(
			effectKinds(effects).filter((t) => t === 'stateChanged')
		).toHaveLength(2)
		expect(effectKinds(effects)).toContain('log')
		// Next player is rogues (another bot in this fixture) — scheduler
		// re-arms for a bot deadline.
		expect(nextState.turnSchedule).toEqual({ kind: 'bot', deadline: 500 })
	})

	it('botTurnResolved logs bot_turn_error when run.error is set and still advances', () => {
		const state = botState()
		const finalState = {
			...state.gameState,
			currentPlayerTribe: 'rogues' as const,
			turn: state.gameState.turn + 1
		}

		const { nextState, effects } = step(
			state,
			{
				kind: 'botTurnResolved',
				tribe: 'barbarians',
				run: {
					finalState,
					intermediateStates: [],
					error: { tribe: 'barbarians', turn: 1, message: 'scorer blew up' }
				}
			},
			500
		)

		expect(nextState.gameState).toBe(finalState)
		const errLog = effects.find(
			(e) => e.t === 'log' && e.event === 'bot_turn_error'
		)
		expect(errLog).toBeDefined()
	})

	it('botTurnResolved no-ops + logs stale when the resolved tribe does not match current', () => {
		const state = botState()
		const finalState = { ...state.gameState, turn: 42 }
		const { nextState, effects, lifecycle } = step(
			state,
			{
				kind: 'botTurnResolved',
				tribe: 'rogues', // mismatch — current player is barbarians
				run: { finalState, intermediateStates: [] }
			},
			500
		)

		expect(nextState).toBe(state)
		// Stale resolutions emit a single `bot_turn_stale` log effect so the
		// host can detect the path firing in production.
		expect(effects).toHaveLength(1)
		const effect = effects[0]
		if (effect?.t !== 'log') {
			throw new Error('expected log')
		}
		expect(effect.event).toBe('bot_turn_stale')
		// And a terminal `botTurnFailed` lifecycle so observers tracking
		// `started == completed + failed` don't go off-by-one on stale drops.
		expect(lifecycle).toHaveLength(1)
		const lc = lifecycle[0]
		if (lc?.t !== 'botTurnFailed') {
			throw new Error('expected botTurnFailed')
		}
		expect(lc.tribe).toBe('rogues')
		expect(lc.reason).toBe('stale_tribe')
	})
})

describe('step — lifecycle array exhaustiveness', () => {
	function expectArrayResult(result: { lifecycle: unknown }) {
		expect(Array.isArray(result.lifecycle)).toBe(true)
	}

	it('every command kind returns a lifecycle array', () => {
		const state = baseState()
		expect.assertions(11)

		expectArrayResult(
			step(
				state,
				{
					kind: 'perform',
					tribe: 'rogues',
					intent: {
						kind: 'move',
						from: { q_idx: 0, r_idx: 0 },
						to: { q_idx: 1, r_idx: 0 }
					}
				},
				1000
			)
		)
		expectArrayResult(
			step(state, { kind: 'endTurn', tribe: 'barbarians' }, 1000)
		)
		expectArrayResult(
			step(
				state,
				{ kind: 'forfeit', tribe: 'barbarians', username: 'alice' },
				1000
			)
		)
		expectArrayResult(step(state, { kind: 'turnTimeout' }, 1000))
		expectArrayResult(step(state, { kind: 'runBotTurn' }, 1000))
		expectArrayResult(
			step(
				state,
				{
					kind: 'botTurnResolved',
					tribe: 'barbarians',
					run: {
						finalState: state.gameState,
						intermediateStates: []
					}
				},
				1000
			)
		)
		expectArrayResult(
			step(
				state,
				{
					kind: 'playerDisconnected',
					playerId: 'p1',
					tribe: 'barbarians',
					username: 'alice'
				},
				1000
			)
		)
		expectArrayResult(
			step(state, { kind: 'playerReconnected', playerId: 'p1' }, 1000)
		)
		expectArrayResult(
			step(state, { kind: 'connectionOpened', playerId: 'p1' }, 1000)
		)
		expectArrayResult(
			step(state, { kind: 'connectionClosed', playerId: 'p1' }, 1000)
		)
		expectArrayResult(
			step({ ...state, connectionCount: 0 }, { kind: 'cleanup' }, 1000)
		)
	})

	it('perform emits commandRejected on rule violation', () => {
		const state = baseState()
		const { lifecycle } = step(
			state,
			{
				kind: 'perform',
				tribe: 'rogues',
				intent: {
					kind: 'move',
					from: { q_idx: 0, r_idx: 0 },
					to: { q_idx: 1, r_idx: 0 }
				}
			},
			1000
		)
		expect(lifecycle).toHaveLength(1)
		const ev = lifecycle[0]
		if (ev?.t !== 'commandRejected') {
			throw new Error('expected rejection')
		}
		expect(ev.tribe).toBe('rogues')
		expect(ev.kind).toBe('perform')
	})

	it('endTurn emits turnAdvanced with the new current tribe', () => {
		const state = baseState()
		const { lifecycle } = step(
			state,
			{ kind: 'endTurn', tribe: 'barbarians' },
			1000
		)
		const turnAdvanced = lifecycle.find((e) => e.t === 'turnAdvanced')
		expect(turnAdvanced).toBeDefined()
		if (turnAdvanced?.t !== 'turnAdvanced') {
			throw new Error('expected advance')
		}
		expect(turnAdvanced.tribe).toBe('rogues')
		expect(turnAdvanced.isBot).toBe(false)
	})

	it('runBotTurn emits botTurnStarted for the current bot', () => {
		const gs = createTestGameState({
			playerStates: createTestPlayerStates({
				barbarians: {
					id: 'player_barbarians',
					name: 'bot',
					tribe: 'barbarians',
					money: 5,
					exploration: {},
					researchedTechs: [],
					researchInProgress: null,
					isBot: true,
					difficulty: 'Beginner'
				}
			})
		})
		const bot: MatchState = {
			...baseState(),
			gameState: gs,
			turnSchedule: { kind: 'bot', deadline: 0 }
		}
		const { lifecycle } = step(bot, { kind: 'runBotTurn' }, 100)
		expect(lifecycle).toHaveLength(1)
		const ev = lifecycle[0]
		if (ev?.t !== 'botTurnStarted') {
			throw new Error('expected start')
		}
		expect(ev.tribe).toBe('barbarians')
	})
})
