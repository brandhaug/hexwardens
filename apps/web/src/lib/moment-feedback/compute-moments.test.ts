import { describe, expect, it } from 'vite-plus/test'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { computeMoments } from './compute-moments'
import {
	makeGameState,
	placeUnit,
	placeVillage,
	setMoney,
	setUnitHealth,
	setVillageLevel,
	setResearchedTechs
} from './test-helpers'

const VIKINGS: Tribe = 'barbarians'
const SAMURAI: Tribe = 'rogues'

describe('computeMoments', () => {
	it('returns no moments for identical states', () => {
		const state = makeGameState()
		expect(computeMoments(state, state, 'turn-1')).toEqual([])
	})

	it('emits a damage moment when a unit loses health', () => {
		const before = placeUnit(makeGameState(), VIKINGS, 'caveman', 10, {
			q_idx: 1,
			r_idx: 2
		})
		const after = setUnitHealth(before, 'unit_0', 7)
		const moments = computeMoments(before, after, 'turn-1')
		const damage = moments.find((m) => m.kind === 'damage')
		expect(damage).toBeDefined()
		if (damage?.kind !== 'damage') {
			throw new Error('expected damage moment')
		}
		expect(damage.amount).toBe(3)
		expect(damage.at).toEqual({ q_idx: 1, r_idx: 2 })
		expect(damage.tribe).toBe(VIKINGS)
	})

	it('emits a heal moment when a unit gains health', () => {
		const before = placeUnit(makeGameState(), VIKINGS, 'caveman', 5, {
			q_idx: 2,
			r_idx: 1
		})
		const after = setUnitHealth(before, 'unit_0', 9)
		const moments = computeMoments(before, after, 'turn-1')
		const heal = moments.find((m) => m.kind === 'heal')
		if (heal?.kind !== 'heal') {
			throw new Error('expected heal moment')
		}
		expect(heal.amount).toBe(4)
	})

	it('emits a unit-defeated moment when a unit disappears from the board', () => {
		const before = placeUnit(makeGameState(), VIKINGS, 'caveman', 10, {
			q_idx: 3,
			r_idx: 2
		})
		const after: GameState = {
			...before,
			units: { board: makeGameState().units.board, unitStates: {} }
		}
		const moments = computeMoments(before, after, 'turn-1')
		const defeat = moments.find((m) => m.kind === 'unit-defeated')
		if (defeat?.kind !== 'unit-defeated') {
			throw new Error('expected unit-defeated moment')
		}
		expect(defeat.tribe).toBe(VIKINGS)
		expect(defeat.at).toEqual({ q_idx: 3, r_idx: 2 })
	})

	it('emits a gold-gain moment when a tribe gains money outside of an end-turn upkeep', () => {
		const base = placeVillage(makeGameState(), VIKINGS, {
			q_idx: 0,
			r_idx: 0
		})
		const before = setMoney(base, VIKINGS, 5)
		const after = setMoney(before, VIKINGS, 9)
		const moments = computeMoments(before, after, 'turn-1')
		const gold = moments.find((m) => m.kind === 'gold-gain')
		if (gold?.kind !== 'gold-gain') {
			throw new Error('expected gold-gain moment')
		}
		expect(gold.amount).toBe(4)
		expect(gold.tribe).toBe(VIKINGS)
	})

	it('does not emit a gold-gain moment when money decreases (spending)', () => {
		const base = placeVillage(makeGameState(), VIKINGS, {
			q_idx: 0,
			r_idx: 0
		})
		const before = setMoney(base, VIKINGS, 10)
		const after = setMoney(before, VIKINGS, 4)
		const moments = computeMoments(before, after, 'turn-1')
		expect(moments.find((m) => m.kind === 'gold-gain')).toBeUndefined()
	})

	it('emits a village-captured moment when a village changes tribe', () => {
		const before = placeVillage(makeGameState(), VIKINGS, {
			q_idx: 3,
			r_idx: 3
		})
		const board = before.units.board.map((row) =>
			row.map((tile) => {
				if (!tile) {
					return tile
				}
				if (tile.item?.type === 'village') {
					return { ...tile, item: { ...tile.item, tribe: SAMURAI } }
				}
				return tile
			})
		)
		const after: GameState = { ...before, units: { ...before.units, board } }
		const moments = computeMoments(before, after, 'turn-1')
		const cap = moments.find((m) => m.kind === 'village-captured')
		if (cap?.kind !== 'village-captured') {
			throw new Error('expected village-captured moment')
		}
		expect(cap.tribe).toBe(SAMURAI)
		expect(cap.at).toEqual({ q_idx: 3, r_idx: 3 })
	})

	it('emits a village-level-up moment when a village levels', () => {
		const before = placeVillage(makeGameState(), VIKINGS, {
			q_idx: 4,
			r_idx: 4
		})
		const after = setVillageLevel(before, { q_idx: 4, r_idx: 4 }, 2)
		const moments = computeMoments(before, after, 'turn-1')
		const lvl = moments.find((m) => m.kind === 'village-level-up')
		if (lvl?.kind !== 'village-level-up') {
			throw new Error('expected village-level-up moment')
		}
		expect(lvl.level).toBe(2)
	})

	it('emits a research-completed moment when a tribe gains a tech', () => {
		const before = makeGameState()
		const after = setResearchedTechs(before, VIKINGS, ['climbing'])
		const moments = computeMoments(before, after, 'turn-1')
		const tech = moments.find((m) => m.kind === 'research-completed')
		if (tech?.kind !== 'research-completed') {
			throw new Error('expected research-completed moment')
		}
		expect(tech.tech).toBe('climbing')
		expect(tech.tribe).toBe(VIKINGS)
	})

	it('namespaces moment ids with the supplied transition tag for idempotent re-mounts', () => {
		const before = placeUnit(makeGameState(), VIKINGS, 'caveman', 10, {
			q_idx: 1,
			r_idx: 0
		})
		const after = setUnitHealth(before, 'unit_0', 4)
		const a = computeMoments(before, after, 'transition-a')
		const b = computeMoments(before, after, 'transition-b')
		const firstA = a[0]
		const firstB = b[0]
		if (!firstA || !firstB) {
			throw new Error('Expected moments in both transitions')
		}
		expect(firstA.id).not.toBe(firstB.id)
		expect(firstA.id).toContain('transition-a')
	})

	it('does not mutate the input states', () => {
		const before = placeUnit(makeGameState(), VIKINGS, 'caveman', 10, {
			q_idx: 1,
			r_idx: 2
		})
		const after = setUnitHealth(before, 'unit_0', 4)
		const beforeSnapshot = JSON.stringify(before)
		const afterSnapshot = JSON.stringify(after)
		computeMoments(before, after, 'turn-1')
		expect(JSON.stringify(before)).toBe(beforeSnapshot)
		expect(JSON.stringify(after)).toBe(afterSnapshot)
	})

	it('returns moments in a stable order for the same transition tag', () => {
		const before = placeUnit(
			placeUnit(makeGameState(), VIKINGS, 'caveman', 10, {
				q_idx: 1,
				r_idx: 0
			}),
			SAMURAI,
			'archer',
			10,
			{ q_idx: 2, r_idx: 1 }
		)
		const after = setUnitHealth(setUnitHealth(before, 'unit_0', 7), 'unit_1', 6)
		const first = computeMoments(before, after, 'turn-1')
		const second = computeMoments(before, after, 'turn-1')
		expect(first.map((m) => m.id)).toEqual(second.map((m) => m.id))
	})
})
