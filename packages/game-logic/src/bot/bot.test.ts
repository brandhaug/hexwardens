import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from '../test/game-test-helpers'
import Prando from 'prando'
import { describe, expect, it } from 'vite-plus/test'
import { GameHex } from '../board/hex-utils'
import { type Difficulty } from '../difficulty'
import { type GameState } from '../game'
import { createBot } from './index'
import { personalities, type BotPersonality } from './personality'

function buildScenario(): GameState {
	const board = createTestBoard(2)

	const barbarian = createTestUnit('barbarians', 'caveman')
	const rogues = createTestUnit('rogues', 'caveman')

	// Friendly barbarian caveman standing on enemy village (capture available)
	requireTestValue(board[2])[2] = {
		...requireTestValue(requireTestValue(board[2])[2]),
		unit: barbarian,
		item: createTestVillage('rogues')
	}
	// Adjacent enemy unit (attack available)
	requireTestValue(board[2])[3] = {
		...requireTestValue(requireTestValue(board[2])[3]),
		unit: rogues
	}
	// Friendly village for research/training options
	requireTestValue(board[0])[0] = {
		...requireTestValue(requireTestValue(board[0])[0]),
		item: createTestVillage('barbarians')
	}

	const unitStates = {
		[barbarian.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman'),
		[rogues.id]: createTestUnitState({ q_idx: 3, r_idx: 2 }, 'caveman')
	}

	return createTestGameState({
		board,
		currentPlayerTribe: 'barbarians',
		unitStates
	})
}

function seededRng(seed: number): () => number {
	const prando = new Prando(seed)
	return () => prando.next()
}

describe('createBot', () => {
	it('returns the same plan for identical seeds and personality (reproducible)', () => {
		const state = buildScenario()
		const bot1 = createBot({
			personality: personalities.Intermediate,
			rng: seededRng(42)
		})
		const bot2 = createBot({
			personality: personalities.Intermediate,
			rng: seededRng(42)
		})

		const plan1 = bot1.chooseAction(state, 'barbarians', GameHex)
		const plan2 = bot2.chooseAction(state, 'barbarians', GameHex)

		expect(plan1).not.toBeNull()
		expect(requireTestValue(plan1).execute()).toEqual(
			requireTestValue(plan2).execute()
		)
	})

	it('returns null when no actions are available', () => {
		// Empty board, no units, no villages, no money -> nothing to do
		const state = createTestGameState({
			board: createTestBoard(2),
			currentPlayerTribe: 'barbarians'
		})

		const bot = createBot({ personality: personalities.Legend })
		expect(bot.chooseAction(state, 'barbarians', GameHex)).toBeNull()
	})

	it('picks the highest-raw action on Legend (zero noise)', () => {
		const state = buildScenario()
		const bot = createBot({ personality: personalities.Legend })

		const plan = requireTestValue(
			bot.chooseAction(state, 'barbarians', GameHex)
		).execute()

		// Capture (base score 200) should dominate every other action at Legend.
		expect(plan).toMatchObject({
			kind: 'tileAction',
			action: { kind: 'capture', at: { q_idx: 2, r_idx: 2 } }
		})
	})

	it('produces different top scores across personalities on a fixed state', () => {
		const state = buildScenario()
		const ids: Difficulty[] = [
			'Beginner',
			'Intermediate',
			'Advanced',
			'Expert',
			'Legend'
		]
		// Shared seed so noise is reproducible; different noiseRange per
		// personality still perturbs the top score.
		const topScores = ids.map((id) => {
			const bot = createBot({
				personality: personalities[id],
				rng: seededRng(7)
			})
			return requireTestValue(bot.chooseAction(state, 'barbarians', GameHex))
				.score
		})

		const unique = new Set(topScores)
		expect(unique.size).toBeGreaterThan(1)
	})

	it('plan ranking varies between personalities when actions are close', () => {
		// Move-only scenario where positional awareness / lookahead can tip
		// the balance between candidate moves.
		const board = createTestBoard(2)
		const barbarian = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			unit: barbarian
		}
		requireTestValue(board[0])[0] = {
			...requireTestValue(requireTestValue(board[0])[0]),
			item: createTestVillage('rogues')
		}
		requireTestValue(board[2])[1] = {
			...requireTestValue(requireTestValue(board[2])[1]),
			item: { type: 'ruins', reward: 'money' }
		}

		const state = createTestGameState({
			board,
			currentPlayerTribe: 'barbarians',
			unitStates: {
				[barbarian.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman')
			}
		})

		const rngNoNoise = () => 0.5
		const beginner = requireTestValue(
			createBot({
				personality: personalities.Beginner,
				rng: rngNoNoise
			}).chooseAction(state, 'barbarians', GameHex)
		).execute()
		const advanced = requireTestValue(
			createBot({
				personality: personalities.Advanced,
				rng: rngNoNoise
			}).chooseAction(state, 'barbarians', GameHex)
		).execute()

		expect(beginner).not.toEqual(advanced)
	})

	it('aggression tuning: per-call attack weight override flips capture->attack', () => {
		const state = buildScenario()

		const baseline = requireTestValue(
			createBot({ personality: personalities.Legend }).chooseAction(
				state,
				'barbarians',
				GameHex
			)
		).execute()
		expect(baseline).toMatchObject({
			action: { kind: 'capture' }
		})

		// With a large attack weight, attack outranks capture on the same state.
		const aggressive = requireTestValue(
			createBot({
				personality: personalities.Legend,
				scorerWeights: { attack: 10 }
			}).chooseAction(state, 'barbarians', GameHex)
		).execute()

		expect(aggressive.kind).toBe('attack')
	})

	it('scoreActions returns all candidates sorted by descending score', () => {
		const state = buildScenario()
		const bot = createBot({ personality: personalities.Legend })

		const actions = bot.scoreActions(state, 'barbarians', GameHex)

		expect(actions.length).toBeGreaterThan(0)
		for (let i = 1; i < actions.length; i++) {
			expect(requireTestValue(actions[i - 1]).score).toBeGreaterThanOrEqual(
				requireTestValue(actions[i]).score
			)
		}
	})

	it('a personality with attack disabled produces no attack candidates', () => {
		// Adding a hypothetical personality requires only a record entry; this
		// test author defines one inline to prove no scorer edits are needed.
		const noAttacks: BotPersonality = {
			id: 'Legend',
			weights: {},
			enabledScorers: new Set([
				'capture',
				'train',
				'explore',
				'collect',
				'build',
				'heal',
				'research',
				'move'
			]),
			lookahead: false,
			noiseRange: 0,
			positionalAwareness: false
		}

		const state = buildScenario()
		const actions = createBot({ personality: noAttacks }).scoreActions(
			state,
			'barbarians',
			GameHex
		)

		expect(actions.every((a) => a.kind !== 'attack')).toBe(true)
	})
})
