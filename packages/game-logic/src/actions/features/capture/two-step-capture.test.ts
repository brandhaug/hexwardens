import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from '../../../test/game-test-helpers'
import { Result } from 'effect'
import { type BoardPosition } from '../../../board/board'
import { dispatch } from '../../../dispatch'
import { getAliveTribesCount } from '../../../game'
import { advanceTurn } from '../../../turns'
import { type UnitStateRecord } from '../../../unit-state-utils'

describe('two-step capture: setup', () => {
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }

	function makeStateWithCaptureCandidate() {
		const board = createTestBoard(2)
		const village = createTestVillage('rogues', { population: 0 })
		const unit = createTestUnit('barbarians', 'caveman')
		const tile = board[at.r_idx]?.[at.q_idx]
		if (!tile) {
			throw new Error('expected tile at (2,2)')
		}
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...tile,
			item: village,
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		return {
			state: createTestGameState({ board, unitStates }),
			unitId: unit.id
		}
	}

	it('does not flip the village ownership immediately', () => {
		const { state } = makeStateWithCaptureCandidate()

		const result = dispatch(state, 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'capture', at }
		})

		if (Result.isFailure(result)) {
			throw new Error(`expected success: ${result.failure.message}`)
		}
		const next = result.success.nextState
		const tile = next.units.board[at.r_idx]?.[at.q_idx]
		expect(tile?.item?.type).toBe('village')
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.tribe).toBe('rogues')
	})

	it('records captureSetup with the capturing tribe and turn initiated', () => {
		const { state } = makeStateWithCaptureCandidate()

		const result = dispatch(state, 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'capture', at }
		})

		if (Result.isFailure(result)) {
			throw new Error(`expected success: ${result.failure.message}`)
		}
		const next = result.success.nextState
		const tile = next.units.board[at.r_idx]?.[at.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.captureSetup).toEqual({
			byTribe: 'barbarians',
			turnInitiated: state.turn
		})
	})

	it('locks the capturing unit by marking it acted', () => {
		const { state, unitId } = makeStateWithCaptureCandidate()

		const result = dispatch(state, 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'capture', at }
		})

		if (Result.isFailure(result)) {
			throw new Error(`expected success: ${result.failure.message}`)
		}
		const next = result.success.nextState
		expect(next.units.unitStates[unitId]?.mode).toBe('acted')
	})
})

describe('two-step capture: flip', () => {
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }

	function makeStateWithSetupMarker() {
		const board = createTestBoard(2)
		const village = createTestVillage('rogues', {
			level: 3,
			perks: ['expand_sight', 'increase_population'],
			population: 4,
			experience: 5,
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const unit = createTestUnit('barbarians', 'caveman')
		const tile = board[at.r_idx]?.[at.q_idx]
		if (!tile) {
			throw new Error('expected tile at (2,2)')
		}
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...tile,
			item: village,
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { mode: 'acted' })
		}
		// currentPlayerTribe = barbarians, rogues's turn ends → barbarians starts
		// next turn. Flip should fire now.
		return createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues'
		})
	}

	it('flips ownership at the start of the capturing tribe’s next turn', () => {
		const state = makeStateWithSetupMarker()

		const next = advanceTurn(state).state

		const tile = next.units.board[at.r_idx]?.[at.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.tribe).toBe('barbarians')
		expect(tile.item.captureSetup).toBeNull()
	})

	it('preserves development but releases the previous roster through the flip', () => {
		const state = makeStateWithSetupMarker()

		const next = advanceTurn(state).state

		const tile = next.units.board[at.r_idx]?.[at.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.level).toBe(3)
		expect(tile.item.perks).toEqual(['expand_sight', 'increase_population'])
		expect(tile.item.population).toBe(0)
		expect(tile.item.experience).toBe(5)
	})

	it('emits a villageCaptured broadcast event when the flip succeeds', () => {
		const state = makeStateWithSetupMarker()

		const result = advanceTurn(state)

		expect(result.events.filter((e) => e.type === 'villageCaptured')).toEqual([
			{
				type: 'villageCaptured',
				byTribe: 'barbarians',
				fromTribe: 'rogues',
				at: { q_idx: 2, r_idx: 2 }
			}
		])
	})
})

describe('two-step capture: cancel by move', () => {
	const villageAt: BoardPosition = { q_idx: 2, r_idx: 2 }

	it('clears the setup marker without flipping when the unit has moved off', () => {
		const board = createTestBoard(2)
		const village = createTestVillage('rogues', {
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const villageTile = board[villageAt.r_idx]?.[villageAt.q_idx]
		if (!villageTile) {
			throw new Error('expected tile')
		}
		// Village tile no longer holds the capturing unit — it moved away during
		// the setup window.
		requireTestValue(board[villageAt.r_idx])[villageAt.q_idx] = {
			...villageTile,
			item: village
		}
		const state = createTestGameState({
			board,
			currentPlayerTribe: 'rogues'
		})

		const next = advanceTurn(state).state

		const tile = next.units.board[villageAt.r_idx]?.[villageAt.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.tribe).toBe('rogues')
		expect(tile.item.captureSetup).toBeNull()
	})

	it('clears the setup marker when a different-tribe unit now stands on it', () => {
		const board = createTestBoard(2)
		const village = createTestVillage('rogues', {
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		// A rogues unit now sits on the village (e.g. rogues retook the tile).
		const roguesUnit = createTestUnit('rogues', 'caveman')
		const villageTile = board[villageAt.r_idx]?.[villageAt.q_idx]
		if (!villageTile) {
			throw new Error('expected tile')
		}
		requireTestValue(board[villageAt.r_idx])[villageAt.q_idx] = {
			...villageTile,
			item: village,
			unit: roguesUnit
		}
		const unitStates: UnitStateRecord = {
			[roguesUnit.id]: createTestUnitState(villageAt, 'caveman')
		}

		const state = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues' // ending → next is barbarians (the captor)
		})

		const next = advanceTurn(state).state

		const tile = next.units.board[villageAt.r_idx]?.[villageAt.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.tribe).toBe('rogues')
		expect(tile.item.captureSetup).toBeNull()
	})
})

describe('two-step capture: cancel by death', () => {
	const villageAt: BoardPosition = { q_idx: 2, r_idx: 2 }

	it('clears the setup marker when the capturing unit died (no longer on tile)', () => {
		const board = createTestBoard(2)
		const village = createTestVillage('rogues', {
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const villageTile = board[villageAt.r_idx]?.[villageAt.q_idx]
		if (!villageTile) {
			throw new Error('expected tile')
		}
		// No unit on the tile — capturing unit died.
		requireTestValue(board[villageAt.r_idx])[villageAt.q_idx] = {
			...villageTile,
			item: village
		}
		const state = createTestGameState({
			board,
			currentPlayerTribe: 'rogues'
		})

		const next = advanceTurn(state).state

		const tile = next.units.board[villageAt.r_idx]?.[villageAt.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.tribe).toBe('rogues')
		expect(tile.item.captureSetup).toBeNull()
	})
})

describe('two-step capture: tribe elimination on flip', () => {
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }

	it('eliminates the original tribe when its last village flips away', () => {
		const board = createTestBoard(2)
		const village = createTestVillage('rogues', {
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const unit = createTestUnit('barbarians', 'caveman')
		const tile = board[at.r_idx]?.[at.q_idx]
		if (!tile) {
			throw new Error('expected tile')
		}
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...tile,
			item: village,
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { mode: 'acted' })
		}

		const state = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues'
		})

		const result = advanceTurn(state)

		expect(result.state.eliminatedTribes).toContain('rogues')
	})

	it('ends the game and leaves one alive tribe when the last opponent village flips', () => {
		const board = createTestBoard(2)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians')
		}
		const village = createTestVillage('rogues', {
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const unit = createTestUnit('barbarians', 'caveman')
		const tile = board[at.r_idx]?.[at.q_idx]
		if (!tile) {
			throw new Error('expected tile')
		}
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...tile,
			item: village,
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { mode: 'acted' })
		}

		const state = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues'
		})

		const result = advanceTurn(state)

		expect(result.state.isGameOver).toBe(true)
		expect(result.state.winner).toBe('barbarians')
		expect(getAliveTribesCount(result.state)).toBe(1)
		expect(result.events).toContainEqual({
			type: 'gameOver',
			winner: 'barbarians'
		})
	})
})

describe('two-step capture: concurrent overwrite', () => {
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }

	it('most-recent capturer wins when a second capture is issued before the flip', () => {
		// Barbarians issued capture last turn (turnInitiated: 1). Rogues pushed
		// barbarians off the tile, placed their own unit on the (still-neutral)
		// village, and then issues their own capture this turn.
		const board = createTestBoard(2)
		const village = createTestVillage(null, {
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const roguesUnit = createTestUnit('rogues', 'caveman')
		const villageTile = board[at.r_idx]?.[at.q_idx]
		if (!villageTile) {
			throw new Error('expected tile')
		}
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...villageTile,
			item: village,
			unit: roguesUnit
		}
		const unitStates: UnitStateRecord = {
			[roguesUnit.id]: createTestUnitState(at, 'caveman')
		}

		const state = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues'
		})

		const result = dispatch(state, 'rogues', {
			kind: 'tileAction',
			action: { kind: 'capture', at }
		})

		if (Result.isFailure(result)) {
			throw new Error(`expected success: ${result.failure.message}`)
		}
		const next = result.success.nextState
		const tile = next.units.board[at.r_idx]?.[at.q_idx]
		if (tile?.item?.type !== 'village') {
			throw new Error('expected village')
		}
		expect(tile.item.captureSetup).toEqual({
			byTribe: 'rogues',
			turnInitiated: state.turn
		})
	})
})
