import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../test/game-test-helpers'
import Prando from 'prando'
import { createRuins } from './ruins'
import {
	getRuinsName,
	getVillageName,
	MAX_LANDMARK_NAME_LENGTH
} from './village-naming'

describe('getVillageName', () => {
	it('produces the same name for the same seed and position', () => {
		const village = createTestVillage('barbarians', { kind: 'capital' })
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: village,
			terrain: 'tundra'
		}
		const state = createTestGameState({ seed: 12_345, board })

		const a = getVillageName(state, { q_idx: 2, r_idx: 2 })
		const b = getVillageName(state, { q_idx: 2, r_idx: 2 })

		expect(a).toBe(b)
	})

	it('produces different names for different positions on the same seed', () => {
		const villageA = createTestVillage('barbarians')
		const villageB = createTestVillage('barbarians')
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: villageA,
			terrain: 'tundra'
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: villageB,
			terrain: 'tundra'
		}
		const state = createTestGameState({ seed: 12_345, board })

		const a = getVillageName(state, { q_idx: 2, r_idx: 2 })
		const b = getVillageName(state, { q_idx: 3, r_idx: 3 })

		expect(a).not.toBe(b)
	})

	it('produces different names for different seeds at the same position', () => {
		const village = createTestVillage('barbarians')
		const boardA = createTestBoard(2)
		requireTestValue(boardA[2])[2] = {
			...requireTestValue(requireTestValue(boardA[2])[2]),
			item: village,
			terrain: 'tundra'
		}
		const boardB = createTestBoard(2)
		requireTestValue(boardB[2])[2] = {
			...requireTestValue(requireTestValue(boardB[2])[2]),
			item: village,
			terrain: 'tundra'
		}
		const stateA = createTestGameState({ seed: 1, board: boardA })
		const stateB = createTestGameState({ seed: 2, board: boardB })

		const a = getVillageName(stateA, { q_idx: 2, r_idx: 2 })
		const b = getVillageName(stateB, { q_idx: 2, r_idx: 2 })

		expect(a).not.toBe(b)
	})

	it('keeps the same name after capture (does not depend on current owner)', () => {
		const ownedByBarbarians = createTestVillage('barbarians', {
			kind: 'regular'
		})
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: ownedByBarbarians,
			terrain: 'tundra'
		}
		const stateBefore = createTestGameState({ seed: 99, board })
		const before = getVillageName(stateBefore, { q_idx: 2, r_idx: 2 })

		const captured = { ...ownedByBarbarians, tribe: 'rogues' as const }
		const boardAfter = createTestBoard(2)
		requireTestValue(boardAfter[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: captured,
			terrain: 'tundra'
		}
		const stateAfter = createTestGameState({ seed: 99, board: boardAfter })
		const after = getVillageName(stateAfter, { q_idx: 2, r_idx: 2 })

		expect(after).toBe(before)
	})

	it('marks capital villages with a distinct title prefix', () => {
		const capital = createTestVillage('barbarians', { kind: 'capital' })
		const regular = createTestVillage('barbarians', { kind: 'regular' })
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: capital,
			terrain: 'tundra'
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: regular,
			terrain: 'tundra'
		}
		const state = createTestGameState({ seed: 7, board })

		const capitalName = getVillageName(state, { q_idx: 2, r_idx: 2 }) ?? ''
		const regularName = getVillageName(state, { q_idx: 3, r_idx: 3 }) ?? ''

		expect(capitalName.startsWith('Great ')).toBe(true)
		expect(regularName.startsWith('Great ')).toBe(false)
	})

	it('returns null when the tile holds no village', () => {
		const board = createTestBoard(2)
		const state = createTestGameState({ seed: 1, board })
		expect(getVillageName(state, { q_idx: 0, r_idx: 0 })).toBeNull()
	})

	it('keeps generated names under the max landmark length', () => {
		const board = createTestBoard(2)
		const positions: { q_idx: number; r_idx: number }[] = []
		for (let r = 0; r < 5; r++) {
			for (let q = 0; q < 5; q++) {
				if (board[r]?.[q]) {
					requireTestValue(board[r])[q] = {
						...requireTestValue(requireTestValue(board[r])[q]),
						item: createTestVillage('barbarians', {
							kind: r === 0 && q === 0 ? 'capital' : 'regular'
						}),
						terrain: r % 2 === 0 ? 'tundra' : 'forest'
					}
					positions.push({ q_idx: q, r_idx: r })
				}
			}
		}
		const state = createTestGameState({ seed: 314_159, board })

		for (const pos of positions) {
			const name = getVillageName(state, pos)
			expect(name).not.toBeNull()
			expect((name ?? '').length).toBeLessThanOrEqual(MAX_LANDMARK_NAME_LENGTH)
		}
	})
})

describe('getRuinsName', () => {
	it('produces a deterministic ruins name from seed and position', () => {
		const ruins = createRuins(new Prando(7))
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: ruins,
			terrain: 'desert'
		}
		const state = createTestGameState({ seed: 42, board })

		const a = getRuinsName(state, { q_idx: 2, r_idx: 2 })
		const b = getRuinsName(state, { q_idx: 2, r_idx: 2 })

		expect(a).toBe(b)
		expect(a).not.toBeNull()
	})

	it('returns null when the tile holds no ruins', () => {
		const board = createTestBoard(2)
		const state = createTestGameState({ seed: 1, board })
		expect(getRuinsName(state, { q_idx: 0, r_idx: 0 })).toBeNull()
	})

	it('keeps ruins names under the max landmark length', () => {
		const ruins = createRuins(new Prando(7))
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: ruins,
			terrain: 'desert'
		}
		const state = createTestGameState({ seed: 999, board })
		const name = getRuinsName(state, { q_idx: 2, r_idx: 2 })
		expect(name).not.toBeNull()
		expect((name ?? '').length).toBeLessThanOrEqual(MAX_LANDMARK_NAME_LENGTH)
	})
})
