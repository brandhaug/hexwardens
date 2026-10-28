import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt
} from '../../../test/game-test-helpers'
import { type BoardPosition } from '../../../board/position'
import { type Tribe } from '../../../domains/tribe'
import { type Village, type VillageKind } from '../../../domains/village'
import { advanceTurn } from '../../../turns'
import { type UnitStateRecord } from '../../../unit-state-utils'

function placeVillage(
	board: ReturnType<typeof createTestBoard>,
	position: BoardPosition,
	village: Village
): void {
	const tile = board[position.r_idx]?.[position.q_idx]
	if (!tile) {
		throw new Error('test setup: tile missing')
	}
	requireTestValue(board[position.r_idx])[position.q_idx] = {
		...tile,
		item: village
	}
}

function buildPendingFlipScenario(
	villageKind: VillageKind,
	originalOwner: Tribe
) {
	const board = createTestBoard(2)
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }
	const village = createTestVillage(originalOwner, {
		kind: villageKind,
		captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
	})
	placeVillage(board, at, village)
	const unit = createTestUnit('barbarians', 'caveman')
	setUnitAt(board, at, unit)
	const unitStates: UnitStateRecord = {
		[unit.id]: createTestUnitState(at, 'caveman', { mode: 'acted' })
	}
	// currentPlayerTribe = rogues → rogues's turn ends → barbarians starts;
	// applyCaptureFlip fires on barbarians's turn-start.
	const state = createTestGameState({
		board,
		unitStates,
		currentPlayerTribe: 'rogues'
	})
	return { state, at }
}

describe('capture — capital flag survives ownership flip', () => {
	it('preserves the capital kind when an enemy capital is captured', () => {
		const { state, at } = buildPendingFlipScenario('capital', 'rogues')

		const next = advanceTurn(state).state

		const captured = next.units.board[at.r_idx]?.[at.q_idx]?.item
		expect(captured?.type).toBe('village')
		assert(captured?.type === 'village')
		expect(captured.kind).toBe('capital')
		expect(captured.tribe).toBe('barbarians')
	})

	it('keeps a regular village regular after the flip', () => {
		const { state, at } = buildPendingFlipScenario('regular', 'rogues')

		const next = advanceTurn(state).state

		const captured = next.units.board[at.r_idx]?.[at.q_idx]?.item
		expect(captured?.type).toBe('village')
		assert(captured?.type === 'village')
		expect(captured.kind).toBe('regular')
		expect(captured.tribe).toBe('barbarians')
	})

	it('does not promote another tribe-owned village to capital when its capital is captured', () => {
		// Original-capital-loss should not relocate the Capital flag.
		const board = createTestBoard(3)
		const capitalPos: BoardPosition = { q_idx: 1, r_idx: 1 }
		const otherVillagePos: BoardPosition = { q_idx: 4, r_idx: 4 }

		const roguesCapital = createTestVillage('rogues', {
			kind: 'capital',
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
		const roguesSecondVillage = createTestVillage('rogues', {
			kind: 'regular'
		})
		placeVillage(board, capitalPos, roguesCapital)
		placeVillage(board, otherVillagePos, roguesSecondVillage)

		const attacker = createTestUnit('barbarians', 'caveman')
		setUnitAt(board, capitalPos, attacker)
		const unitStates: UnitStateRecord = {
			[attacker.id]: createTestUnitState(capitalPos, 'caveman', {
				mode: 'acted'
			})
		}
		const state = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues'
		})

		const next = advanceTurn(state).state

		// The captured former-capital flips to barbarians and stays capital.
		const captured =
			next.units.board[capitalPos.r_idx]?.[capitalPos.q_idx]?.item
		expect(captured?.type).toBe('village')
		assert(captured?.type === 'village')
		expect(captured.kind).toBe('capital')
		expect(captured.tribe).toBe('barbarians')

		// The rogues's other village must not have been promoted to capital.
		const remaining =
			next.units.board[otherVillagePos.r_idx]?.[otherVillagePos.q_idx]?.item
		expect(remaining?.type).toBe('village')
		assert(remaining?.type === 'village')
		expect(remaining.kind).toBe('regular')
		expect(remaining.tribe).toBe('rogues')
	})
})
