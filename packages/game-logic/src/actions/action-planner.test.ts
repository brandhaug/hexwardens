import type * as TribeRangeModule from '../board/tribe-range'
import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../test/game-test-helpers'
import { type BoardPosition } from '../board/board'
import { editPlayer } from '../player/player-state'
import { type TileState } from '../tile/tile'

// Passthrough spy on the territory derivation so tests can observe how many
// times an engine operation derives the context. The real implementation
// still runs — only call counts are recorded.
// The public planner exposes no instrumentation seam; this real call-through spy verifies
// the one-derivation contract without introducing a production API solely for tests.
// oxlint-disable-next-line anti-slop/no-module-mocking
vi.mock('../board/tribe-range', async (importOriginal) => {
	const actual = await importOriginal<typeof TribeRangeModule>()
	return {
		getTribeVillageRange: vi.fn<typeof actual.getTribeVillageRange>(
			actual.getTribeVillageRange
		)
	}
})

import { getTribeVillageRange } from '../board/tribe-range'
import {
	availableActions,
	createActionPlanner,
	executePlan,
	planAction
} from './engine'

function placeAt(
	board: ReturnType<typeof createTestBoard>,
	pos: BoardPosition,
	patch: Partial<TileState>
): void {
	const tile = board[pos.r_idx]?.[pos.q_idx]
	if (!tile) {
		throw new Error('no tile')
	}
	requireTestValue(board[pos.r_idx])[pos.q_idx] = { ...tile, ...patch }
}

function fundedVillageFixture(tribe: 'barbarians' | 'rogues') {
	const board = createTestBoard(2)
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }
	const village = createTestVillage(tribe, {
		population: 0,
		maxPopulation: 5
	})
	placeAt(board, at, { item: village })
	const baseState = createTestGameState({ board })
	const state = {
		...baseState,
		playerStates: editPlayer(baseState.playerStates, tribe, (draft) => {
			draft.credit(50)
		})
	}
	return { state, at }
}

beforeEach(() => {
	vi.mocked(getTribeVillageRange).mockClear()
})

describe('createActionPlanner: context derived once per operation', () => {
	it('derives the territory once at construction and never again across plan/execute/availableActions', () => {
		const { state, at } = fundedVillageFixture('barbarians')

		const planner = createActionPlanner(state, 'barbarians', at)
		expect(vi.mocked(getTribeVillageRange)).toHaveBeenCalledTimes(1)

		const plans = planner.availableActions()
		expect(plans.length).toBeGreaterThan(0)

		const plan = planner.plan({ kind: 'train', at, unit: 'caveman' })
		expect(plan.kind).toBe('allowed')
		assert(plan.kind === 'allowed')

		const { state: next } = planner.execute(plan)
		expect(next.units.board[at.r_idx]?.[at.q_idx]?.unit?.type).toBe('caveman')

		// availableActions + plan + execute all served from the single
		// construction-time derivation.
		expect(vi.mocked(getTribeVillageRange)).toHaveBeenCalledTimes(1)
	})

	it('availableActions performs exactly one derivation for the whole enumeration', () => {
		const { state, at } = fundedVillageFixture('barbarians')
		const plans = availableActions(state, 'barbarians', at)
		expect(plans.length).toBeGreaterThan(1)
		expect(vi.mocked(getTribeVillageRange)).toHaveBeenCalledTimes(1)
	})
})

describe('createActionPlanner: explicit previewing tribe', () => {
	it('previews a non-current tribe without mutating the input state', () => {
		const { state, at } = fundedVillageFixture('rogues')
		expect(state.currentPlayerTribe).toBe('barbarians')

		const planner = createActionPlanner(state, 'rogues', at)
		const plans = planner.availableActions()

		expect(
			plans.some((plan) => plan.preview.actionType === 'train-caveman')
		).toBe(true)
		expect(state.currentPlayerTribe).toBe('barbarians')
	})

	it('validates costs against the explicit tribe player state', () => {
		const { state, at } = fundedVillageFixture('rogues')
		// Rogues were funded; barbarians (the current player) were not. The
		// same tile yields plans for rogues and nothing for barbarians.
		const roguesPlans = createActionPlanner(
			state,
			'rogues',
			at
		).availableActions()
		const barbarianPlans = createActionPlanner(
			state,
			'barbarians',
			at
		).availableActions()
		expect(roguesPlans.length).toBeGreaterThan(0)
		expect(barbarianPlans).toEqual([])
	})
})

describe('createActionPlanner: parity with one-shot wrappers', () => {
	it('plan() matches planAction and execute() matches executePlan', () => {
		const { state, at } = fundedVillageFixture('barbarians')
		const planner = createActionPlanner(state, 'barbarians', at)

		const viaPlanner = planner.plan({ kind: 'train', at, unit: 'caveman' })
		const viaWrapper = planAction(state, { kind: 'train', at, unit: 'caveman' })
		expect(viaPlanner).toEqual(viaWrapper)
		assert(viaPlanner.kind === 'allowed')

		const executedViaPlanner = planner.execute(viaPlanner)
		const executedViaWrapper = executePlan(state, viaPlanner)
		expect(executedViaPlanner.state).toEqual(executedViaWrapper.state)
		expect(executedViaPlanner.message).toBe(executedViaWrapper.message)
	})

	it('handles a missing tile the same way as the wrappers', () => {
		const state = createTestGameState({ board: createTestBoard(2) })
		const offBoard: BoardPosition = { q_idx: 99, r_idx: 99 }
		const planner = createActionPlanner(state, 'barbarians', offBoard)

		const plan = planner.plan({ kind: 'build', at: offBoard })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('invalidTarget')

		expect(planner.availableActions()).toEqual([])
	})
})
