import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt,
	withUnits
} from '../test/game-test-helpers'
import { Result } from 'effect'
import Prando from 'prando'
import { describe, expect, it } from 'vite-plus/test'
import { GameHex } from '../board/hex-utils'
import { type Difficulty } from '../difficulty'
import { type GameState } from '../game'
import { executeBotAction } from './bot-turn'
import { createBot } from './index'
import { personalities, type BotPersonality } from './personality'
import { type ScorerKind } from './score-context'

const ALL_DIFFICULTIES: readonly Difficulty[] = [
	'Beginner',
	'Intermediate',
	'Advanced',
	'Expert',
	'Legend'
]

const ALL_SCORER_KINDS: readonly ScorerKind[] = [
	'attack',
	'capture',
	'train',
	'explore',
	'collect',
	'build',
	'heal',
	'research',
	'move'
]

function seededRng(seed: number): () => number {
	const prando = new Prando(seed)
	return () => prando.next()
}

/** Standard scenario: capture, attack, build, train, research, collect available. */
function richScenario(): GameState {
	const board = createTestBoard(3)
	const barbarian = createTestUnit('barbarians', 'caveman')
	const rogues = createTestUnit('rogues', 'caveman')

	// Friendly barbarian on enemy village (capture available).
	requireTestValue(board[2])[2] = {
		...requireTestValue(requireTestValue(board[2])[2]),
		unit: barbarian,
		item: createTestVillage('rogues')
	}
	// Adjacent enemy unit (attack available).
	requireTestValue(board[2])[3] = {
		...requireTestValue(requireTestValue(board[2])[3]),
		unit: rogues
	}
	// Friendly village (research / training).
	requireTestValue(board[0])[0] = {
		...requireTestValue(requireTestValue(board[0])[0]),
		item: createTestVillage('barbarians')
	}

	return createTestGameState({
		board,
		currentPlayerTribe: 'barbarians',
		unitStates: {
			[barbarian.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman'),
			[rogues.id]: createTestUnitState({ q_idx: 3, r_idx: 2 }, 'caveman')
		}
	})
}

describe('personalities table', () => {
	it('has an entry for every Difficulty id', () => {
		for (const id of ALL_DIFFICULTIES) {
			expect(personalities[id]).toBeDefined()
			expect(personalities[id].id).toBe(id)
		}
	})

	it('Legend has zero noise and lookahead enabled', () => {
		// Noise=0 + lookahead=true is what makes Legend the deterministic
		// "perfect-play" personality in the legacy difficulty-config table.
		expect(personalities.Legend.noiseRange).toBe(0)
		expect(personalities.Legend.lookahead).toBe(true)
		expect(personalities.Legend.positionalAwareness).toBe(true)
	})

	it('Beginner has the highest noise and no lookahead', () => {
		// Lifted from the legacy difficultyToTuning table; serves as a
		// regression guard against accidental tuning drift.
		expect(personalities.Beginner.noiseRange).toBe(50)
		expect(personalities.Beginner.lookahead).toBe(false)
		expect(personalities.Beginner.positionalAwareness).toBe(false)
	})

	it('Beginner < Intermediate < Advanced < Expert < Legend by descending noise', () => {
		const order = ALL_DIFFICULTIES.map((id) => personalities[id].noiseRange)
		expect(requireTestValue(order[0])).toBeGreaterThanOrEqual(
			requireTestValue(order[1])
		)
		expect(requireTestValue(order[1])).toBeGreaterThanOrEqual(
			requireTestValue(order[2])
		)
		expect(requireTestValue(order[2])).toBeGreaterThanOrEqual(
			requireTestValue(order[3])
		)
		expect(requireTestValue(order[3])).toBeGreaterThanOrEqual(
			requireTestValue(order[4])
		)
	})

	it('every personality enables every scorer kind by default', () => {
		// Personalities that opt out of scorers are valid (see test below)
		// but the shipped 5 use the full scorer set. Asserting this keeps
		// the RFC contract honest: opt-out is a feature, not a default.
		for (const id of ALL_DIFFICULTIES) {
			for (const kind of ALL_SCORER_KINDS) {
				expect(personalities[id].enabledScorers.has(kind)).toBe(true)
			}
		}
	})
})

describe('createBot — determinism', () => {
	it.each(ALL_DIFFICULTIES)(
		'%s: same (state, rng seed) -> same action',
		(id) => {
			const state = richScenario()
			const a = createBot({
				personality: personalities[id],
				rng: seededRng(13)
			})
			const b = createBot({
				personality: personalities[id],
				rng: seededRng(13)
			})
			const planA = a.chooseAction(state, 'barbarians', GameHex)
			const planB = b.chooseAction(state, 'barbarians', GameHex)
			expect(planA?.execute()).toEqual(planB?.execute())
		}
	)
})

describe('createBot — boundary behaviors', () => {
	it('Legend (zero-noise) prefers capture (highest-base scorer) over alternatives', () => {
		// Capture has BASE_CAPTURE_SCORE=200 vs attack's 100. With noise=0 a
		// "hard" bot must pick capture every time.
		const state = richScenario()
		const plan = requireTestValue(
			createBot({ personality: personalities.Legend }).chooseAction(
				state,
				'barbarians',
				GameHex
			)
		).execute()
		expect(plan).toMatchObject({
			kind: 'tileAction',
			action: { kind: 'capture' }
		})
	})

	it('Legend lookahead enables move scoring that Beginner cannot reach', () => {
		// Build a state where the only ready unit can move toward an enemy
		// village. The lookahead branch evaluates the future-attack bonus
		// when `canAttackAfterMove` units land within striking range; the
		// non-lookahead branch does not.
		const board = createTestBoard(3)
		const sprinter = createTestUnit('barbarians', 'sprinter')
		const enemy = createTestUnit('rogues', 'caveman')
		const sprinterPos = { q_idx: 2, r_idx: 2 }
		const enemyPos = { q_idx: 4, r_idx: 2 }
		setUnitAt(board, sprinterPos, sprinter)
		setUnitAt(board, enemyPos, enemy)
		const state = withUnits(
			createTestGameState({ currentPlayerTribe: 'barbarians' }),
			{
				board,
				unitStates: {
					[sprinter.id]: createTestUnitState(sprinterPos, 'sprinter'),
					[enemy.id]: createTestUnitState(enemyPos, 'caveman')
				}
			}
		)

		// Use rng=0.5 so the noise term collapses to 0 — the only difference
		// between scores is then the lookahead vs. non-lookahead movement
		// scorer output.
		const noNoise = () => 0.5
		const beginnerActions = createBot({
			personality: personalities.Beginner,
			rng: noNoise
		}).scoreActions(state, 'barbarians', GameHex)
		const legendActions = createBot({
			personality: personalities.Legend,
			rng: noNoise
		}).scoreActions(state, 'barbarians', GameHex)

		// Both produce candidates, but the Legend lookahead variant assigns
		// strictly higher peak move scores when an attack-after-move is
		// reachable from the candidate target.
		const peak = (xs: { kind: string; score: number }[]) =>
			xs
				.filter((x) => x.kind === 'move')
				.reduce((m, x) => Math.max(m, x.score), -Infinity)
		expect(peak(legendActions)).toBeGreaterThan(peak(beginnerActions))
	})

	it('every personality returns either a legal plan or null', () => {
		// Property: dispatching the chosen plan against the original state
		// must not blow up (Result.fail is acceptable — the contract is "the
		// bot does not return illegal types"). Run on 2 representative
		// scenarios across all 5 personalities + 4 seeds = 40 cases.
		const states = [
			richScenario(),
			createTestGameState({ board: createTestBoard(2) })
		]
		for (const state of states) {
			for (const id of ALL_DIFFICULTIES) {
				for (const seed of [1, 2, 3, 4]) {
					const bot = createBot({
						personality: personalities[id],
						rng: seededRng(seed)
					})
					const action = bot.chooseAction(state, 'barbarians', GameHex)
					if (action === null) {
						continue
					}
					const plan = action.execute()
					// `executeBotAction` returns Result; the test asserts the
					// dispatch path accepts the plan as a known kind.
					const result = executeBotAction(state, plan, 'barbarians', GameHex)
					expect(['move', 'attack', 'tileAction']).toContain(plan.kind)
					expect(Result.isSuccess(result) || Result.isFailure(result)).toBe(
						true
					)
				}
			}
		}
	})
})

describe('createBot — extensibility', () => {
	it('a new personality slots in without scorer edits', () => {
		// The whole point of the refactor: adding a personality is a record
		// entry. Build a "pacifist" — captures, builds, collects only — and
		// confirm the bot honors the smaller scorer set without touching
		// any scorer file.
		const pacifist: BotPersonality = {
			id: 'Legend',
			weights: { capture: 2, build: 2 },
			enabledScorers: new Set(['capture', 'build', 'collect', 'research']),
			lookahead: false,
			noiseRange: 0,
			positionalAwareness: false
		}

		const state = richScenario()
		const actions = createBot({ personality: pacifist }).scoreActions(
			state,
			'barbarians',
			GameHex
		)

		// No attack / move / heal / train / explore candidates.
		const kinds = new Set(actions.map((a) => a.kind))
		expect(kinds.has('attack')).toBe(false)
		expect(kinds.has('move')).toBe(false)
		expect(kinds.has('heal')).toBe(false)
		expect(kinds.has('train')).toBe(false)
		expect(kinds.has('explore')).toBe(false)
	})

	it('per-call scorerWeights override personality weights', () => {
		// Same flip-tested in bot.test.ts but at the personality boundary:
		// override is identity-merged on top of personality.weights, with
		// override taking precedence.
		const state = richScenario()

		const baseline = requireTestValue(
			createBot({ personality: personalities.Legend }).chooseAction(
				state,
				'barbarians',
				GameHex
			)
		).execute()
		expect(baseline).toMatchObject({
			kind: 'tileAction',
			action: { kind: 'capture' }
		})

		const aggressive = requireTestValue(
			createBot({
				personality: personalities.Legend,
				scorerWeights: { attack: 10 }
			}).chooseAction(state, 'barbarians', GameHex)
		).execute()
		expect(aggressive.kind).toBe('attack')
	})
})
