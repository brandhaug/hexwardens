import { emptyChronicle } from '@hexwardens/game-logic/match/chronicle/chronicle'
import { MatchId, PlayerId, Username } from '@hexwardens/game-logic/ids'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import { createTestGameState } from '@hexwardens/game-logic/test/game-test-helpers'
import { type MatchResult } from './types'
import { dailyCompletionsForMatch } from './daily-match-completions'

const baseResult = (): MatchResult => ({
	matchId: MatchId.make('match-1'),
	winner: 'barbarians',
	players: [
		{
			playerId: PlayerId.make('user_alice'),
			username: Username.make('alice'),
			tribe: 'barbarians',
			isBot: false
		},
		{
			playerId: PlayerId.make('user_bob'),
			username: Username.make('bob'),
			tribe: 'rogues',
			isBot: false
		}
	],
	duration: 300,
	turnCount: 12,
	mapSize: 'small',
	completedAt: '2026-05-05T12:00:00.000Z'
})

const baseState = (overrides: Partial<MatchState> = {}): MatchState => ({
	matchId: 'match-1',
	gameState: createTestGameState(),
	config: {
		kind: 'publicQueue',
		mapSize: 'small',
		turnTimerSeconds: 60,
		players: []
	},
	startedAt: 0,
	dailyDate: '2026-05-05',
	playerIdToTribe: {},
	turnSchedule: null,
	cleanupDeadline: null,
	disconnectedPlayers: {},
	connectionCount: 2,
	forfeitedTribes: [],
	chronicle: {
		entries: [
			{
				seq: 1,
				kind: 'villageCaptured',
				actorTribe: 'barbarians',
				targetTribe: null,
				position: { q_idx: 0, r_idx: 0 },
				turn: 2
			},
			{
				seq: 2,
				kind: 'villageCaptured',
				actorTribe: 'barbarians',
				targetTribe: null,
				position: { q_idx: 1, r_idx: 0 },
				turn: 4
			},
			{
				seq: 3,
				kind: 'villageCaptured',
				actorTribe: 'barbarians',
				targetTribe: null,
				position: { q_idx: 2, r_idx: 0 },
				turn: 6
			},
			{
				seq: 4,
				kind: 'villageCaptured',
				actorTribe: 'barbarians',
				targetTribe: null,
				position: { q_idx: 3, r_idx: 0 },
				turn: 8
			},
			{
				seq: 5,
				kind: 'villageCaptured',
				actorTribe: 'barbarians',
				targetTribe: null,
				position: { q_idx: 4, r_idx: 0 },
				turn: 10
			}
		],
		nextSeq: 6
	},
	...overrides
})

describe('dailyCompletionsForMatch', () => {
	it('returns completed public-queue daily attempts with completedAtTurn', () => {
		const completions = dailyCompletionsForMatch(baseState(), baseResult())

		expect(completions).toEqual([
			{
				userId: 'user_alice',
				username: 'alice',
				dailyDate: '2026-05-05',
				challengeId: 'capture-five-villages',
				turns: 10
			}
		])
	})

	it("does not void a Player's completion when an opponent forfeits", () => {
		// Opponent (rogues) forfeited but the completing Player (barbarians)
		// did not — per ADR-0008 Q5, only the completer's own forfeit voids.
		const state = baseState({ forfeitedTribes: ['rogues'] })
		const completions = dailyCompletionsForMatch(state, baseResult())

		expect(completions).toHaveLength(1)
		expect(completions[0]?.userId).toBe('user_alice')
	})

	it('skips private matches and forfeited players', () => {
		expect(
			dailyCompletionsForMatch(
				baseState({ config: { ...baseState().config, kind: 'private' } }),
				baseResult()
			)
		).toEqual([])

		expect(
			dailyCompletionsForMatch(
				baseState({ forfeitedTribes: ['barbarians'] }),
				baseResult()
			)
		).toEqual([])
	})

	it('records one completion per Player when multiple Players hit the target', () => {
		const stateWithBothTribes = baseState({
			chronicle: {
				entries: [
					{
						seq: 1,
						kind: 'villageCaptured',
						actorTribe: 'barbarians',
						targetTribe: null,
						position: { q_idx: 0, r_idx: 0 },
						turn: 2
					},
					{
						seq: 2,
						kind: 'villageCaptured',
						actorTribe: 'rogues',
						targetTribe: null,
						position: { q_idx: 1, r_idx: 0 },
						turn: 2
					},
					{
						seq: 3,
						kind: 'villageCaptured',
						actorTribe: 'barbarians',
						targetTribe: null,
						position: { q_idx: 0, r_idx: 1 },
						turn: 4
					},
					{
						seq: 4,
						kind: 'villageCaptured',
						actorTribe: 'rogues',
						targetTribe: null,
						position: { q_idx: 1, r_idx: 1 },
						turn: 4
					},
					{
						seq: 5,
						kind: 'villageCaptured',
						actorTribe: 'barbarians',
						targetTribe: null,
						position: { q_idx: 0, r_idx: 2 },
						turn: 6
					},
					{
						seq: 6,
						kind: 'villageCaptured',
						actorTribe: 'rogues',
						targetTribe: null,
						position: { q_idx: 1, r_idx: 2 },
						turn: 6
					},
					{
						seq: 7,
						kind: 'villageCaptured',
						actorTribe: 'barbarians',
						targetTribe: null,
						position: { q_idx: 0, r_idx: 3 },
						turn: 8
					},
					{
						seq: 8,
						kind: 'villageCaptured',
						actorTribe: 'rogues',
						targetTribe: null,
						position: { q_idx: 1, r_idx: 3 },
						turn: 8
					},
					{
						seq: 9,
						kind: 'villageCaptured',
						actorTribe: 'barbarians',
						targetTribe: null,
						position: { q_idx: 0, r_idx: 4 },
						turn: 10
					},
					{
						seq: 10,
						kind: 'villageCaptured',
						actorTribe: 'rogues',
						targetTribe: null,
						position: { q_idx: 1, r_idx: 4 },
						turn: 12
					}
				],
				nextSeq: 11
			}
		})

		const completions = dailyCompletionsForMatch(
			stateWithBothTribes,
			baseResult()
		)

		expect(completions).toHaveLength(2)
		expect(completions).toContainEqual({
			userId: 'user_alice',
			username: 'alice',
			dailyDate: '2026-05-05',
			challengeId: 'capture-five-villages',
			turns: 10
		})
		expect(completions).toContainEqual({
			userId: 'user_bob',
			username: 'bob',
			dailyDate: '2026-05-05',
			challengeId: 'capture-five-villages',
			turns: 12
		})
	})

	it('excludes bots even when their chronicle entries hit the target', () => {
		const result: MatchResult = {
			...baseResult(),
			players: [
				{
					playerId: PlayerId.make('bot_1'),
					username: Username.make('Bot'),
					tribe: 'barbarians',
					isBot: true
				},
				{
					playerId: PlayerId.make('user_bob'),
					username: Username.make('bob'),
					tribe: 'rogues',
					isBot: false
				}
			]
		}
		expect(dailyCompletionsForMatch(baseState(), result)).toEqual([])
	})

	it('uses the match dailyDate instead of the completion timestamp day', () => {
		const completions = dailyCompletionsForMatch(baseState(), {
			...baseResult(),
			completedAt: '2026-05-06T00:00:00.000Z'
		})

		expect(completions[0]?.dailyDate).toBe('2026-05-05')
	})

	it('returns nothing when the challenge was not completed', () => {
		const state = baseState({
			chronicle: {
				...emptyChronicle,
				entries: baseState().chronicle?.entries.slice(0, 4) ?? []
			}
		})

		expect(dailyCompletionsForMatch(state, baseResult())).toEqual([])
	})
})
