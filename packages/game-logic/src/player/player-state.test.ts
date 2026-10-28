import { requireTestValue } from '../test/game-test-helpers'
import { type Tribe } from '../domains/tribe'
import {
	AlreadyResearchedError,
	createInitialPlayerStates,
	editPlayer,
	InsufficientFundsError,
	NoResearchInProgressError,
	type PlayerStateRecord,
	ResearchAlreadyInProgressError,
	UnknownTribeError
} from './player-state'

function makeStates(overrides?: Partial<{ money: number }>): PlayerStateRecord {
	return createInitialPlayerStates([
		{
			tribe: 'barbarians',
			name: 'Ragnar',
			money: overrides?.money ?? 5,
			isBot: false,
			difficulty: 'Beginner'
		}
	])
}

describe('editPlayer — single ops', () => {
	it('credits money', () => {
		const states = makeStates({ money: 5 })
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.credit(10)
		})
		expect(requireTestValue(next['barbarians']).money).toBe(15)
	})

	it('spends money when sufficient', () => {
		const states = makeStates({ money: 10 })
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.spend(7)
		})
		expect(requireTestValue(next['barbarians']).money).toBe(3)
	})

	it('starts research and sets researchInProgress', () => {
		const states = makeStates()
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.startResearch('climbing', 2)
		})
		expect(requireTestValue(next['barbarians']).researchInProgress).toEqual({
			tech: 'climbing',
			turnsRemaining: 2
		})
	})

	it('tickResearchProgress decrements turnsRemaining by 1 by default', () => {
		const base = makeStates()
		const states: PlayerStateRecord = {
			...base,
			barbarians: {
				...requireTestValue(base['barbarians']),
				researchInProgress: { tech: 'mine', turnsRemaining: 3 }
			}
		}
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.tickResearchProgress()
		})
		expect(requireTestValue(next['barbarians']).researchInProgress).toEqual({
			tech: 'mine',
			turnsRemaining: 2
		})
	})

	it('completeResearch promotes tech and clears progress', () => {
		const base = makeStates()
		const states: PlayerStateRecord = {
			...base,
			barbarians: {
				...requireTestValue(base['barbarians']),
				researchInProgress: { tech: 'mine', turnsRemaining: 0 }
			}
		}
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.completeResearch()
		})
		expect(requireTestValue(next['barbarians']).researchedTechs).toContain(
			'mine'
		)
		expect(requireTestValue(next['barbarians']).researchInProgress).toBeNull()
	})

	it('exploreTiles merges tiles into exploration', () => {
		const base = makeStates()
		const states: PlayerStateRecord = {
			...base,
			barbarians: {
				...requireTestValue(base['barbarians']),
				exploration: { 'a,1': true }
			}
		}
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.exploreTiles(['b,2', 'c,3'])
		})
		expect(requireTestValue(next['barbarians']).exploration).toEqual({
			'a,1': true,
			'b,2': true,
			'c,3': true
		})
	})
})

describe('editPlayer — op composition', () => {
	it('applies multiple ops in one mutator', () => {
		const states = makeStates({ money: 10 })
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.spend(3)
			draft.exploreTiles(['0,0', '1,0'])
		})
		expect(requireTestValue(next['barbarians']).money).toBe(7)
		expect(requireTestValue(next['barbarians']).exploration['0,0']).toBe(true)
		expect(requireTestValue(next['barbarians']).exploration['1,0']).toBe(true)
	})

	it('sequential edits to the same tribe compose', () => {
		const start = makeStates({ money: 10 })
		const afterFirst = editPlayer(start, 'barbarians', (draft) => {
			draft.spend(3)
		})
		const afterSecond = editPlayer(afterFirst, 'barbarians', (draft) => {
			draft.credit(2)
		})

		expect(requireTestValue(afterSecond['barbarians']).money).toBe(9)
	})
})

describe('editPlayer — invariant violations', () => {
	it('over-spend throws InsufficientFundsError', () => {
		const states = makeStates({ money: 3 })
		expect(() =>
			editPlayer(states, 'barbarians', (draft) => {
				draft.spend(10)
			})
		).toThrow(InsufficientFundsError)
	})

	it('leaves the input record untouched when a helper throws', () => {
		const states = makeStates({ money: 3 })
		const original = requireTestValue(states['barbarians'])
		expect(() =>
			editPlayer(states, 'barbarians', (draft) => {
				draft.credit(100)
				draft.spend(1000)
			})
		).toThrow(InsufficientFundsError)

		expect(requireTestValue(states['barbarians'])).toBe(original)
		expect(requireTestValue(states['barbarians']).money).toBe(3)
	})

	it('startResearch on already-researched tech throws', () => {
		const base = makeStates()
		const states: PlayerStateRecord = {
			...base,
			barbarians: {
				...requireTestValue(base['barbarians']),
				researchedTechs: ['climbing']
			}
		}
		expect(() =>
			editPlayer(states, 'barbarians', (draft) => {
				draft.startResearch('climbing', 2)
			})
		).toThrow(AlreadyResearchedError)
	})

	it('startResearch while another is in progress throws', () => {
		const base = makeStates()
		const states: PlayerStateRecord = {
			...base,
			barbarians: {
				...requireTestValue(base['barbarians']),
				researchInProgress: { tech: 'fruit_harvesting', turnsRemaining: 1 }
			}
		}
		expect(() =>
			editPlayer(states, 'barbarians', (draft) => {
				draft.startResearch('climbing', 2)
			})
		).toThrow(ResearchAlreadyInProgressError)
	})

	it('tickResearchProgress with nothing in progress throws', () => {
		const states = makeStates()
		expect(() =>
			editPlayer(states, 'barbarians', (draft) => {
				draft.tickResearchProgress()
			})
		).toThrow(NoResearchInProgressError)
	})

	it('completeResearch with nothing in progress throws', () => {
		const states = makeStates()
		expect(() =>
			editPlayer(states, 'barbarians', (draft) => {
				draft.completeResearch()
			})
		).toThrow(NoResearchInProgressError)
	})

	it('unknown tribe throws UnknownTribeError', () => {
		const states = makeStates()
		const missingTribe: Tribe = 'orcs'
		expect(() =>
			editPlayer(states, missingTribe, (draft) => {
				draft.credit(5)
			})
		).toThrow(UnknownTribeError)
	})
})

describe('editPlayer — immutability', () => {
	it('does not mutate the input record on success', () => {
		const states = makeStates({ money: 5 })
		const original = requireTestValue(states['barbarians'])
		const next = editPlayer(states, 'barbarians', (draft) => {
			draft.credit(10)
		})
		expect(next).not.toBe(states)
		expect(requireTestValue(states['barbarians'])).toBe(original)
		expect(requireTestValue(states['barbarians']).money).toBe(5)
	})
})
