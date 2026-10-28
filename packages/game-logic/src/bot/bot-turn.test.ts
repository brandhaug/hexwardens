import type * as BotModule from './index'
import { vi } from 'vite-plus/test'
import { GameHex } from '../board/hex-utils'
import {
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	setUnitAt,
	withUnits
} from '../test/game-test-helpers'
import { type Bot, type BotOptions } from './index'
import { type BotActionPlan } from './bot-types'
import { type ScoredAction } from './score-context'
import { immediatePacer } from './bot-pacer'
import { runBotTurn } from './bot-turn'

type Entry = BotActionPlan | null | 'throw'

// Module-level cursor for the scripted mock. `createScripter(entries)` resets
// both `script` and `idx`; every `describe` block below calls it in its own
// `beforeEach` so leaked cursor state from a previous test can't be observed.
let script: Entry[] = []
let idx = 0

function createScripter(entries: Entry[]): void {
	script = entries
	idx = 0
}

function scriptNext(): Entry {
	const entry = script[idx]
	idx++
	return entry ?? null
}

// Script `createBot` so tests can choose the exact (plan | throw | null)
// sequence the loop will walk. The real `executeBotAction` is used against a
// live board — plans that point at a friendly unit succeed, plans that don't
// naturally fail via the Result machinery. `BotOptions` is ignored because
// the scripted bot doesn't consult personality or scorer weights — tests own
// the exact decision sequence.
vi.mock('./index', async () => {
	const actual = await vi.importActual<typeof BotModule>('./index')
	return {
		...actual,
		createBot: (_opts: BotOptions): Bot => ({
			chooseAction: () => {
				const next = scriptNext()
				if (next === 'throw') {
					throw new Error('scorer blew up')
				}
				if (next === null) {
					return null
				}
				return {
					kind: next.kind === 'tileAction' ? 'capture' : next.kind,
					score: 0,
					execute: () => next
				} satisfies ScoredAction
			},
			scoreActions: () => []
		})
	}
})

function boardWithBarbarianSoldier() {
	const board = createTestBoard(3)
	const unit = createTestUnit('barbarians', 'caveman')
	const unitPos = { q_idx: 3, r_idx: 3 }
	setUnitAt(board, unitPos, unit)
	const state = withUnits(
		createTestGameState({ currentPlayerTribe: 'barbarians' }),
		{
			board,
			unitStates: { [unit.id]: createTestUnitState(unitPos, 'caveman') }
		}
	)
	return { state, unitId: unit.id, unitPos }
}

function validMovePlan(
	unitId: ReturnType<typeof boardWithBarbarianSoldier>['unitId'],
	from: { q_idx: number; r_idx: number },
	to: { q_idx: number; r_idx: number }
): BotActionPlan {
	return { kind: 'move', unitId, from, to }
}

function invalidMovePlan(
	unitId: ReturnType<typeof boardWithBarbarianSoldier>['unitId']
): BotActionPlan {
	// Move from an empty tile to another empty tile — `executeMovement` rejects.
	return {
		kind: 'move',
		unitId,
		from: { q_idx: 0, r_idx: 0 },
		to: { q_idx: 1, r_idx: 0 }
	}
}

describe('runBotTurn', () => {
	beforeEach(() => {
		createScripter([])
	})

	it('cancels even when a custom pacer never settles', async () => {
		const { state } = boardWithBarbarianSoldier()
		const controller = new AbortController()
		const reason = new Error('match replaced')
		const run = runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			signal: controller.signal,
			pacer: { next: () => new Promise(() => {}) }
		})
		controller.abort(reason)
		await expect(run).rejects.toBe(reason)
		expect(idx).toBe(0)
	})

	it('terminates when chooseAction returns null and rotates to the next tribe', async () => {
		createScripter([null])
		const { state } = boardWithBarbarianSoldier()
		const startTribe = state.currentPlayerTribe
		const startTurn = state.turn

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer
		})

		expect(run.intermediateStates).toHaveLength(0)
		expect(run.error).toBeUndefined()
		// advanceTurn rotated the current player and may have incremented turn.
		expect(run.finalState.currentPlayerTribe).not.toBe(startTribe)
		expect(run.finalState.turn).toBeGreaterThanOrEqual(startTurn)
	})

	it('emits one intermediate state per successful action', async () => {
		const { state, unitId, unitPos } = boardWithBarbarianSoldier()
		const targetA = { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		createScripter([validMovePlan(unitId, unitPos, targetA), null])

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer
		})

		expect(run.intermediateStates).toHaveLength(1)
		expect(run.error).toBeUndefined()
	})

	it('fires onStep after each successful action on the post-action state', async () => {
		const { state, unitId, unitPos } = boardWithBarbarianSoldier()
		const targetA = { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		createScripter([validMovePlan(unitId, unitPos, targetA), null])
		const steps: number[] = []

		await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer,
			onStep: () => steps.push(1)
		})

		expect(steps).toHaveLength(1)
	})

	it('terminates on maxActions and advanceTurn still runs', async () => {
		const { state, unitId } = boardWithBarbarianSoldier()
		// All of these fail (invalid from-tile), so they increment the action
		// counter but don't advance state. We use maxActions to halt the loop
		// before the failure cap trips.
		createScripter(Array.from({ length: 50 }, () => invalidMovePlan(unitId)))
		const startTribe = state.currentPlayerTribe

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer,
			maxActions: 2,
			maxConsecutiveFailures: 999
		})

		// No successful actions -> no intermediates.
		expect(run.intermediateStates).toHaveLength(0)
		expect(run.error).toBeUndefined()
		expect(run.finalState.currentPlayerTribe).not.toBe(startTribe)
	})

	it('terminates on maxConsecutiveFailures and advanceTurn still runs', async () => {
		const { state, unitId } = boardWithBarbarianSoldier()
		createScripter([
			invalidMovePlan(unitId),
			invalidMovePlan(unitId),
			invalidMovePlan(unitId),
			invalidMovePlan(unitId) // never reached
		])
		const startTribe = state.currentPlayerTribe

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer,
			maxConsecutiveFailures: 3
		})

		expect(run.intermediateStates).toHaveLength(0)
		expect(run.error).toBeUndefined()
		expect(run.finalState.currentPlayerTribe).not.toBe(startTribe)
	})

	it('captures a scorer throw into error and still advances the turn', async () => {
		createScripter(['throw'])
		const { state } = boardWithBarbarianSoldier()
		const startTribe = state.currentPlayerTribe

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer
		})

		expect(run.error).toBeDefined()
		expect(run.error?.message).toContain('scorer blew up')
		expect(run.error?.tribe).toBe('barbarians')
		expect(run.finalState.currentPlayerTribe).not.toBe(startTribe)
	})

	it('captures a mid-loop scorer throw: prior successful states are preserved, subsequent script entries are dropped', async () => {
		const { state, unitId, unitPos } = boardWithBarbarianSoldier()
		const targetA = { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		const targetB = { q_idx: targetA.q_idx + 1, r_idx: targetA.r_idx }
		// Valid move → throw → valid move (never reached).
		createScripter([
			validMovePlan(unitId, unitPos, targetA),
			'throw',
			validMovePlan(unitId, targetA, targetB)
		])

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer
		})

		// The successful action before the throw must land in intermediateStates.
		expect(run.intermediateStates).toHaveLength(1)
		// The throw is captured on error — the third scripted entry never runs.
		expect(run.error?.message).toContain('scorer blew up')
		// advanceTurn still fires — the turn rotates.
		expect(run.finalState.currentPlayerTribe).not.toBe(state.currentPlayerTribe)
	})

	it('rejects with the abort reason when aborted and does not advance the turn', async () => {
		const { state, unitId, unitPos } = boardWithBarbarianSoldier()
		const targetA = { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		createScripter([validMovePlan(unitId, unitPos, targetA)])

		const controller = new AbortController()
		const reason = new Error('unmount')
		controller.abort(reason)
		const startTribe = state.currentPlayerTribe

		await expect(
			runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
				pacer: {
					next: (signal) => Promise.reject(signal.reason)
				},
				signal: controller.signal
			})
		).rejects.toBe(reason)

		// The original state is unchanged — advanceTurn did not run.
		expect(state.currentPlayerTribe).toBe(startTribe)
	})

	it('intermediateStates all precede advanceTurn (same current tribe)', async () => {
		const { state, unitId, unitPos } = boardWithBarbarianSoldier()
		const targetA = { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		const targetB = { q_idx: targetA.q_idx + 1, r_idx: targetA.r_idx }
		createScripter([
			validMovePlan(unitId, unitPos, targetA),
			validMovePlan(unitId, targetA, targetB),
			null
		])
		const startTribe = state.currentPlayerTribe

		const run = await runBotTurn(state, 'barbarians', 'Beginner', GameHex, {
			pacer: immediatePacer
		})

		for (const inter of run.intermediateStates) {
			expect(inter.currentPlayerTribe).toBe(startTribe)
		}
		expect(run.finalState.currentPlayerTribe).not.toBe(startTribe)
	})
})
