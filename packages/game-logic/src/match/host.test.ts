import { describe, expect, it } from 'vite-plus/test'
import { type BotTurnRun } from '../bot/bot-turn'
import { runMatchCommand, type MatchHost } from './host'
import { createRecordingMatchHost } from './recording-host'
import {
	createTestGameState,
	createTestPlayerStates
} from '../test/game-test-helpers'
import { type MatchConfig } from '../multiplayer/types'
import { type MatchCommand, type MatchState } from './types'

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

describe('runMatchCommand', () => {
	it('dispatches every effect from a perform command to the host in order', () => {
		const state = baseState()
		const host = createRecordingMatchHost()

		runMatchCommand(
			state,
			{
				kind: 'perform',
				tribe: 'rogues', // Not current player → rejection
				intent: {
					kind: 'move',
					from: { q_idx: 0, r_idx: 0 },
					to: { q_idx: 1, r_idx: 0 }
				}
			},
			host,
			1000
		)

		// Rejection: messageToTribe error + commandRejected lifecycle. No state
		// mutation, so saveState should NOT be invoked.
		expect(host.effectSequence()).toEqual(['sendToTribe', 'lifecycle'])
		const send = host.calls[0]
		if (send?.effect !== 'sendToTribe') {
			throw new Error('expected sendToTribe')
		}
		expect(send.tribe).toBe('rogues')
		expect(send.msg.type).toBe('error')
	})

	it('dispatches an endTurn command: stateChanged → events → chronicle → log → timer → lifecycle → saveState', () => {
		const state = baseState()
		const host = createRecordingMatchHost()

		const result = runMatchCommand(
			state,
			{ kind: 'endTurn', tribe: 'barbarians' },
			host,
			1000
		)

		// Sequence: stateChanged (projectState), turnEvents broadcast,
		// chronicleEntries broadcast, log, turnTimerUpdate broadcast, then
		// lifecycles (chronicleEntries + turnAdvanced), then save.
		expect(host.effectSequence()).toEqual([
			'saveState',
			'projectState',
			'broadcastAll',
			'broadcastAll',
			'log',
			'broadcastAll',
			'lifecycle',
			'lifecycle'
		])
		expect(result.state.gameState.currentPlayerTribe).toBe('rogues')
		expect(result.pendingBotTurns).toHaveLength(0)
	})

	it('cleanup with no connections fires destroyMatch — terminal effect', () => {
		const state = baseState({ connectionCount: 0, disconnectedPlayers: {} })
		const host = createRecordingMatchHost()

		runMatchCommand(state, { kind: 'cleanup' }, host, 1000)

		expect(host.effectSequence()).toEqual(['saveState', 'destroyMatch'])
	})

	it('forfeit emits log + broadcastAll + (game-end via sealing) and saves', () => {
		const state = baseState()
		const host = createRecordingMatchHost()

		runMatchCommand(
			state,
			{ kind: 'forfeit', tribe: 'rogues', username: 'bob' },
			host,
			1000
		)

		// `forfeit` of one tribe in a 2-player match seals the game →
		// gameEnded + lifecycle + saveState.
		const seq = host.effectSequence()
		expect(seq).toContain('log')
		expect(seq).toContain('broadcastAll')
		expect(seq).toContain('endGame')
		expect(seq).toContain('saveState')
	})

	it('saveState is omitted when step did not mutate state (referential equality)', () => {
		const state = baseState()
		const host = createRecordingMatchHost()

		// `playerReconnected` for a player not in the disconnected map is a
		// no-op — `step` returns the same `state` reference.
		runMatchCommand(
			state,
			{ kind: 'playerReconnected', playerId: 'p99' },
			host,
			1000
		)

		expect(host.calls).toHaveLength(0)
	})
})

describe('runMatchCommand — bot-turn integration', () => {
	it('emits scheduleBotTurn when runBotTurn is dispatched against a bot state', () => {
		const state = botState()
		const host = createRecordingMatchHost()

		const result = runMatchCommand(state, { kind: 'runBotTurn' }, host, 100)

		expect(host.effectSequence()).toContain('scheduleBotTurn')
		expect(host.effectSequence()).toContain('lifecycle')
		// `step` cleared `turnSchedule` so saveState fires.
		expect(host.effectSequence()).toContain('saveState')
		// `awaitBotTurn` returned a promise — surfaced in pendingBotTurns.
		expect(result.pendingBotTurns).toHaveLength(1)
	})

	it('queueBotTurn lets tests deterministically resolve a bot run', async () => {
		const state = botState()
		const finalGameState = {
			...state.gameState,
			currentPlayerTribe: 'rogues' as const,
			turn: state.gameState.turn + 1
		}
		const queuedRun: BotTurnRun = {
			finalState: finalGameState,
			intermediateStates: []
		}

		// Track follow-up dispatches the test-host injects on bot resolution.
		const followUps: { tribe: string; turn: number }[] = []
		const host = createRecordingMatchHost({
			onBotTurnResolved: (tribe, run) => {
				followUps.push({ tribe, turn: run.finalState.turn })
			}
		})
		host.queueBotTurn(queuedRun)

		const { pendingBotTurns } = runMatchCommand(
			state,
			{ kind: 'runBotTurn' },
			host,
			100
		)

		await Promise.all(pendingBotTurns)
		expect(followUps).toEqual([
			{ tribe: 'barbarians', turn: finalGameState.turn }
		])
	})
})

/**
 * Cross-host parity: the same command must produce the same observable
 * host-call sequence on any conforming `MatchHost`. Two recording hosts —
 * one driven directly by `runMatchCommand`, one driven by an alternative
 * adapter that wraps the first — must emit identical sequences.
 */
describe('runMatchCommand — cross-host parity', () => {
	function captureSequence(state: MatchState, command: MatchCommand): string[] {
		const host = createRecordingMatchHost()
		runMatchCommand(state, command, host, 1000)
		return host.effectSequence()
	}

	it('endTurn produces the same observable host-call sequence regardless of host instance', () => {
		const state = baseState()
		const a = captureSequence(state, { kind: 'endTurn', tribe: 'barbarians' })
		const b = captureSequence(state, { kind: 'endTurn', tribe: 'barbarians' })
		expect(a).toEqual(b)
	})

	it('forwarding host (delegates every call) produces an identical recording', () => {
		const state = baseState()
		const direct = createRecordingMatchHost()
		const forwarded = createRecordingMatchHost()
		// Forwarding adapter: every method delegates to `forwarded` while
		// also recording on its own — proves the orchestrator is the only
		// source of host calls (no hidden DO/offline-only branches).
		const forwarder: MatchHost = {
			saveState: (s) => forwarded.saveState(s),
			projectState: (s) => forwarded.projectState(s),
			sendToTribe: (t, m) => forwarded.sendToTribe(t, m),
			broadcastAll: (m) => forwarded.broadcastAll(m),
			endGame: (r) => forwarded.endGame(r),
			destroyMatch: () => forwarded.destroyMatch(),
			log: (e, d) => forwarded.log(e, d),
			scheduleBotTurn: (t, d, g) => forwarded.scheduleBotTurn(t, d, g),
			emitLifecycle: (e) => forwarded.emitLifecycle(e)
		}

		runMatchCommand(
			state,
			{ kind: 'endTurn', tribe: 'barbarians' },
			direct,
			1000
		)
		runMatchCommand(
			state,
			{ kind: 'endTurn', tribe: 'barbarians' },
			forwarder,
			1000
		)

		expect(forwarded.effectSequence()).toEqual(direct.effectSequence())
	})
})
