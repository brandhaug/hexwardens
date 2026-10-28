import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	makeGameState,
	placeVillage,
	setVillageLevel
} from '@/lib/moment-feedback/test-helpers'
import { bannerCopy, computeBannerEvents } from './banner-events'

// Real tribe slugs from `@hexwardens/game-logic/domains/tribe` so the test
// keeps the same compile-checked discriminant the runtime sees.
const A: Tribe = 'barbarians'
const B: Tribe = 'rogues'
const C: Tribe = 'druids'

function setCurrentTribe(state: GameState, tribe: Tribe): GameState {
	return { ...state, currentPlayerTribe: tribe }
}

function setGameOver(state: GameState): GameState {
	return { ...state, isGameOver: true }
}

function setVillageTribe(
	state: GameState,
	at: BoardPosition,
	tribe: Tribe
): GameState {
	const board = state.units.board.map((row, r_idx) =>
		row.map((tile, q_idx) => {
			if (r_idx !== at.r_idx || q_idx !== at.q_idx || !tile) {
				return tile
			}
			if (tile.item?.type !== 'village') {
				return tile
			}
			return { ...tile, item: { ...tile.item, tribe } }
		})
	)
	return { ...state, units: { ...state.units, board } }
}

describe('computeBannerEvents — turn rotation', () => {
	test('rotation to the local tribe emits a your-turn banner with the turn number', () => {
		const before = setCurrentTribe(makeGameState(), B)
		const after = { ...setCurrentTribe(before, A), turn: 12 }
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([
			{ kind: 'your-turn', id: 't1:your-turn', turn: 12 }
		])
	})

	test('rotation between two opponents is silent for the local player', () => {
		const before = setCurrentTribe(makeGameState(), B)
		const after = setCurrentTribe(before, C)
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([])
	})

	test('a transition that keeps the local tribe steering does not re-announce', () => {
		const before = setCurrentTribe(makeGameState(), A)
		const after = { ...before, turn: before.turn + 1 }
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([])
	})

	test('no your-turn banner once the match has ended', () => {
		const before = setCurrentTribe(makeGameState(), B)
		const after = setGameOver(setCurrentTribe(before, A))
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([])
	})
})

describe('computeBannerEvents — capital captures', () => {
	const at: BoardPosition = { q_idx: 2, r_idx: 2 }

	function capitalOwnedBy(tribe: Tribe): GameState {
		return setVillageLevel(placeVillage(makeGameState(), tribe, at), at, 5)
	}

	test('a capital flipping owner emits a capital-captured banner', () => {
		const before = capitalOwnedBy(B)
		const after = setVillageTribe(before, at, C)
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([
			{
				kind: 'capital-captured',
				id: 't1:capital-captured:2,2',
				byTribe: C,
				fromTribe: B
			}
		])
	})

	test('a plain village flipping owner stays tile-level (no banner)', () => {
		const before = setVillageLevel(placeVillage(makeGameState(), B, at), at, 4)
		const after = setVillageTribe(before, at, C)
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([])
	})

	test('an unchanged capital is silent', () => {
		const before = capitalOwnedBy(B)
		const after = { ...before }
		expect(computeBannerEvents(before, after, A, 't1')).toEqual([])
	})
})

describe('bannerCopy — copy and tone', () => {
	test('your-turn reads as the gold "Your Move" plaque', () => {
		expect(bannerCopy({ kind: 'your-turn', id: 'x', turn: 12 }, A)).toEqual({
			eyebrow: 'Turn 12',
			title: 'Your Move',
			tone: 'gold'
		})
	})

	test('losing your own capital is the only ember banner', () => {
		const banner = {
			kind: 'capital-captured',
			id: 'x',
			byTribe: B,
			fromTribe: A
		} as const
		expect(bannerCopy(banner, A)).toEqual({
			eyebrow: 'To the Rogues',
			title: 'Capital Lost',
			tone: 'ember'
		})
	})

	test('seizing a capital yourself reads gold', () => {
		const banner = {
			kind: 'capital-captured',
			id: 'x',
			byTribe: A,
			fromTribe: B
		} as const
		expect(bannerCopy(banner, A)).toEqual({
			eyebrow: 'From the Rogues',
			title: 'Capital Seized',
			tone: 'gold'
		})
	})

	test('third-party captures name both tribes', () => {
		const banner = {
			kind: 'capital-captured',
			id: 'x',
			byTribe: B,
			fromTribe: C
		} as const
		expect(bannerCopy(banner, A)).toEqual({
			eyebrow: 'Rogues over Druids',
			title: 'Capital Taken',
			tone: 'gold'
		})
	})
})
