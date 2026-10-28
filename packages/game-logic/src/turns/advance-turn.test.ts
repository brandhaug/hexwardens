import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from '../test/game-test-helpers'
import { createInitialPlayerStates } from '../player/player-state'
import { type UnitStateRecord } from '../unit-state-utils'
import { advanceTurn } from './index'

describe('advanceTurn', () => {
	it('includes chronicle entries derived from public Turn events', () => {
		const board = createTestBoard(2)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians')
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('rogues')
		}
		const state = createTestGameState({
			board,
			currentPlayerTribe: 'barbarians'
		})

		const result = advanceTurn(state)

		expect(result.events).toContainEqual({
			type: 'turnRotated',
			from: 'barbarians',
			to: 'rogues',
			turn: 1
		})
		expect(result.chronicleEntries).toContainEqual({
			kind: 'turnAdvanced',
			actorTribe: 'rogues',
			turn: 1
		})
	})

	const radius = 2

	function setupTwoPlayerGame(barbarianSalary = 1, roguesSalary = 1) {
		const board = createTestBoard(radius)

		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians', { salary: barbarianSalary })
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('rogues', { salary: roguesSalary })
		}

		return createTestGameState({ board })
	}

	it('adds salary from villages to ending player money', () => {
		const gameState = setupTwoPlayerGame(3)

		const newState = advanceTurn(gameState).state

		expect(requireTestValue(newState.playerStates.barbarians).money).toBe(8)
	})

	it('rotates to next player', () => {
		const gameState = setupTwoPlayerGame()

		const newState = advanceTurn(gameState).state

		expect(newState.currentPlayerTribe).toBe('rogues')
	})

	it('increments turn when cycling back to first player', () => {
		const gameState = {
			...setupTwoPlayerGame(),
			currentPlayerTribe: 'rogues' as const
		}

		const newState = advanceTurn(gameState).state

		expect(newState.currentPlayerTribe).toBe('barbarians')
		expect(newState.turn).toBe(2)
	})

	it('does not increment turn mid-round', () => {
		const newState = advanceTurn(setupTwoPlayerGame()).state
		expect(newState.turn).toBe(1)
	})

	it('rotates from an eliminated current player to the next active player in order', () => {
		const board = createTestBoard(radius)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians')
		}
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: createTestVillage('rogues')
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('druids')
		}
		const gameState = createTestGameState({
			board,
			playerStates: createInitialPlayerStates([
				{
					tribe: 'barbarians',
					name: 'Player 1',
					money: 5,
					isBot: false,
					difficulty: 'Beginner'
				},
				{
					tribe: 'rogues',
					name: 'Player 2',
					money: 5,
					isBot: false,
					difficulty: 'Beginner'
				},
				{
					tribe: 'druids',
					name: 'Player 3',
					money: 5,
					isBot: false,
					difficulty: 'Beginner'
				}
			]),
			currentPlayerTribe: 'rogues',
			eliminatedTribes: ['rogues']
		})

		const newState = advanceTurn(gameState).state

		expect(newState.currentPlayerTribe).toBe('druids')
		expect(newState.turn).toBe(1)
	})

	it('resets unit modes when an eliminated last player wraps to the first active player', () => {
		const board = createTestBoard(radius)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians')
		}
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: createTestVillage('rogues')
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('druids')
		}
		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[2])[1] = {
			...requireTestValue(requireTestValue(board[2])[1]),
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState({ q_idx: 1, r_idx: 2 }, 'caveman', {
				mode: 'acted'
			})
		}
		const gameState = createTestGameState({
			board,
			unitStates,
			playerStates: createInitialPlayerStates([
				{
					tribe: 'barbarians',
					name: 'Player 1',
					money: 5,
					isBot: false,
					difficulty: 'Beginner'
				},
				{
					tribe: 'rogues',
					name: 'Player 2',
					money: 5,
					isBot: false,
					difficulty: 'Beginner'
				},
				{
					tribe: 'druids',
					name: 'Player 3',
					money: 5,
					isBot: false,
					difficulty: 'Beginner'
				}
			]),
			currentPlayerTribe: 'druids',
			eliminatedTribes: ['druids']
		})

		const newState = advanceTurn(gameState).state

		expect(newState.currentPlayerTribe).toBe('barbarians')
		expect(newState.turn).toBe(2)
		expect(newState.units.unitStates[unit.id]?.mode).toBe('ready')
	})

	it('resets unit modes at end of round', () => {
		const board = createTestBoard(radius)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians')
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('rogues')
		}

		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			unit
		}

		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman', {
				mode: 'acted'
			})
		}

		const gameState = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'rogues'
		})

		const newState = advanceTurn(gameState).state

		expect(newState.units.unitStates[unit.id]?.mode).toBe('ready')
	})

	it('does not reset unit modes mid-round', () => {
		const board = createTestBoard(radius)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians')
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('rogues')
		}

		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			unit
		}

		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman', {
				mode: 'acted'
			})
		}

		const gameState = createTestGameState({
			board,
			unitStates,
			currentPlayerTribe: 'barbarians'
		})

		const newState = advanceTurn(gameState).state

		expect(newState.units.unitStates[unit.id]?.mode).toBe('acted')
	})

	it('sets game over when only one tribe remains', () => {
		const gameState = createTestGameState({
			board: createTestBoard(radius),
			eliminatedTribes: ['rogues'],
			currentPlayerTribe: 'barbarians'
		})

		const newState = advanceTurn(gameState).state

		expect(newState.isGameOver).toBe(true)
		expect(newState.winner).toBe('barbarians')
	})

	describe('tech passives', () => {
		it('territory_regen heals friendly units on friendly territory', () => {
			const board = createTestBoard(radius)
			requireTestValue(board[2])[2] = {
				...requireTestValue(requireTestValue(board[2])[2]),
				item: createTestVillage('barbarians')
			}

			const unit = createTestUnit('barbarians', 'caveman')
			requireTestValue(board[2])[2] = {
				...requireTestValue(requireTestValue(board[2])[2]),
				unit
			}

			const damagedHp = 5
			const unitStates: UnitStateRecord = {
				[unit.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman', {
					health: damagedHp
				})
			}

			const gameState = createTestGameState({
				board,
				unitStates,
				currentPlayerTribe: 'barbarians'
			})
			gameState.playerStates.barbarians = {
				...requireTestValue(gameState.playerStates.barbarians),
				researchedTechs: ['mineral_mastery']
			}

			const newState = advanceTurn(gameState).state

			expect(newState.units.unitStates[unit.id]?.health).toBe(damagedHp + 2)
		})
	})

	describe('research', () => {
		it('ticks research progress for ending player', () => {
			const gameState = setupTwoPlayerGame()
			gameState.playerStates.barbarians = {
				...requireTestValue(gameState.playerStates.barbarians),
				researchInProgress: { tech: 'mine', turnsRemaining: 2 }
			}

			const newState = advanceTurn(gameState).state

			expect(
				requireTestValue(newState.playerStates.barbarians).researchInProgress
					?.turnsRemaining
			).toBe(1)
		})

		it('completes research when progress reaches zero', () => {
			const gameState = setupTwoPlayerGame()
			gameState.playerStates.barbarians = {
				...requireTestValue(gameState.playerStates.barbarians),
				researchInProgress: { tech: 'mine', turnsRemaining: 1 }
			}

			const newState = advanceTurn(gameState).state

			expect(
				requireTestValue(newState.playerStates.barbarians).researchInProgress
			).toBeNull()
			expect(
				requireTestValue(newState.playerStates.barbarians).researchedTechs
			).toContain('mine')
		})
	})

	describe('events', () => {
		it('emits a salary event for the ending player', () => {
			const { events } = advanceTurn(setupTwoPlayerGame(3))
			expect(events.filter((e) => e.type === 'salary')).toEqual([
				{ type: 'salary', tribe: 'barbarians', amount: 3 }
			])
		})

		it('omits the salary event when villages award nothing', () => {
			const state = createTestGameState()
			const { events } = advanceTurn(state)
			expect(events.some((e) => e.type === 'salary')).toBe(false)
		})

		it('emits a completed research event', () => {
			const state = setupTwoPlayerGame()
			state.playerStates.barbarians = {
				...requireTestValue(state.playerStates.barbarians),
				researchInProgress: { tech: 'climbing', turnsRemaining: 1 }
			}

			const { events } = advanceTurn(state)

			expect(events.filter((e) => e.type === 'research')).toEqual([
				{
					type: 'research',
					tribe: 'barbarians',
					tech: 'climbing',
					completed: true
				}
			])
		})

		it('emits exactly one research event per completed tech', () => {
			const state = setupTwoPlayerGame()
			state.playerStates.barbarians = {
				...requireTestValue(state.playerStates.barbarians),
				researchInProgress: { tech: 'mine', turnsRemaining: 1 }
			}
			const { events } = advanceTurn(state)
			const completions = events.filter(
				(e) => e.type === 'research' && e.completed
			)
			expect(completions).toHaveLength(1)
		})

		it('emits an in-progress research event while turns remain', () => {
			const state = setupTwoPlayerGame()
			state.playerStates.barbarians = {
				...requireTestValue(state.playerStates.barbarians),
				researchInProgress: { tech: 'mine', turnsRemaining: 2 }
			}

			const { events } = advanceTurn(state)

			expect(events.filter((e) => e.type === 'research')).toEqual([
				{
					type: 'research',
					tribe: 'barbarians',
					tech: 'mine',
					completed: false,
					turnsRemaining: 1
				}
			])
		})

		it('emits a turnRotated event with the new turn number', () => {
			const state = {
				...setupTwoPlayerGame(),
				currentPlayerTribe: 'rogues' as const
			}

			const { events } = advanceTurn(state)

			expect(events.filter((e) => e.type === 'turnRotated')).toEqual([
				{ type: 'turnRotated', from: 'rogues', to: 'barbarians', turn: 2 }
			])
		})

		it('signals game end via gameEnded + null newCurrentTribe', () => {
			const state = createTestGameState({
				board: createTestBoard(radius),
				eliminatedTribes: ['rogues'],
				currentPlayerTribe: 'barbarians'
			})

			const result = advanceTurn(state)

			expect(result.gameEnded).toBe(true)
			expect(result.newCurrentTribe).toBeNull()
			expect(result.events.filter((e) => e.type === 'gameOver')).toEqual([
				{ type: 'gameOver', winner: 'barbarians' }
			])
		})

		it('emits a villageLevel event with aggregated level-ups', () => {
			const board = createTestBoard(radius)
			requireTestValue(board[2])[2] = {
				...requireTestValue(requireTestValue(board[2])[2]),
				item: createTestVillage('barbarians')
			}
			const state = createTestGameState({
				board,
				pendingVillageLevelUps: { barbarians: 3 }
			})

			const { events } = advanceTurn(state)

			expect(events.filter((e) => e.type === 'villageLevel')).toEqual([
				{ type: 'villageLevel', tribe: 'barbarians', levelUps: 3 }
			])
		})

		it('exposes the next player via newCurrentTribe while ongoing', () => {
			const result = advanceTurn(setupTwoPlayerGame())
			expect(result.gameEnded).toBe(false)
			expect(result.newCurrentTribe).toBe('rogues')
		})

		it('keeps state and turn counter consistent across many turns', () => {
			let state = setupTwoPlayerGame(2)
			for (let i = 0; i < 10; i++) {
				state = advanceTurn(state).state
			}
			expect(state.turn).toBe(6)
		})
	})

	describe('phase log', () => {
		it('exposes the canonical phase order', () => {
			const result = advanceTurn(setupTwoPlayerGame())
			expect(result.phaseLog).toEqual([
				'salary',
				'techPassives',
				'research',
				'unitReset',
				'debuffTick',
				'explorationCommit',
				'villageExperienceCommit',
				'rotation',
				'captureFlip',
				'gameOver'
			])
		})

		it('runs every phase even when no players are eligible to act early', () => {
			const result = advanceTurn(setupTwoPlayerGame())
			expect(result.phaseLog).toHaveLength(10)
		})

		it('returns an empty phase log when there are no active players', () => {
			const state = createTestGameState({
				board: createTestBoard(radius),
				eliminatedTribes: ['barbarians', 'rogues']
			})
			const result = advanceTurn(state)
			expect(result.phaseLog).toEqual([])
		})
	})

	describe('determinism', () => {
		it('produces the same TurnAdvance for the same input across runs', () => {
			const a = setupTwoPlayerGame(3)
			const b = setupTwoPlayerGame(3)
			const first = advanceTurn(a)
			const second = advanceTurn(b)
			expect(second.state).toEqual(first.state)
			expect(second.events).toEqual(first.events)
			expect(second.phaseLog).toEqual(first.phaseLog)
			expect(second.gameEnded).toBe(first.gameEnded)
			expect(second.newCurrentTribe).toBe(first.newCurrentTribe)
		})

		it('chained advanceTurn calls remain deterministic across replays', () => {
			let a = setupTwoPlayerGame(2)
			let b = setupTwoPlayerGame(2)
			for (let i = 0; i < 4; i++) {
				a = advanceTurn(a).state
				b = advanceTurn(b).state
			}
			expect(b).toEqual(a)
		})
	})

	describe('event-mutation contract', () => {
		it('omits a salary event when ending player money is unchanged', () => {
			// No villages on the board → 0 salary, no money mutation, no event.
			const state = createTestGameState()
			const before = requireTestValue(
				state.playerStates[state.currentPlayerTribe]
			).money
			const { state: next, events } = advanceTurn(state)
			const after = requireTestValue(
				next.playerStates[state.currentPlayerTribe]
			).money
			expect(after).toBe(before)
			expect(events.some((e) => e.type === 'salary')).toBe(false)
		})

		it('emits a salary event whenever ending player money goes up', () => {
			const state = setupTwoPlayerGame(5)
			const tribe = state.currentPlayerTribe
			const before = requireTestValue(state.playerStates[tribe]).money
			const { state: next, events } = advanceTurn(state)
			const delta = requireTestValue(next.playerStates[tribe]).money - before
			const salary = events.find((e) => e.type === 'salary')
			expect(salary).toBeDefined()
			if (salary?.type !== 'salary') {
				throw new Error('expected salary event')
			}
			expect(salary.amount).toBe(delta)
		})

		it('emits a turnRotated event whenever currentPlayerTribe changes', () => {
			const state = setupTwoPlayerGame()
			const before = state.currentPlayerTribe
			const { state: next, events } = advanceTurn(state)
			expect(next.currentPlayerTribe).not.toBe(before)
			const rotated = events.find((e) => e.type === 'turnRotated')
			expect(rotated).toBeDefined()
			if (rotated?.type !== 'turnRotated') {
				throw new Error('expected turnRotated event')
			}
			expect(rotated.from).toBe(before)
			expect(rotated.to).toBe(next.currentPlayerTribe)
			expect(rotated.turn).toBe(next.turn)
		})

		it('emits a gameOver event whenever isGameOver flips on', () => {
			const state = createTestGameState({
				board: createTestBoard(radius),
				eliminatedTribes: ['rogues'],
				currentPlayerTribe: 'barbarians'
			})
			expect(state.isGameOver).toBe(false)
			const { state: next, events } = advanceTurn(state)
			expect(next.isGameOver).toBe(true)
			expect(events.filter((e) => e.type === 'gameOver')).toEqual([
				{ type: 'gameOver', winner: next.winner }
			])
		})
	})

	describe('turn-end invariants', () => {
		it('credits salary to the ending player (not the rotating-in player)', () => {
			const state = setupTwoPlayerGame(2, 7)
			expect(state.currentPlayerTribe).toBe('barbarians')
			const before = requireTestValue(state.playerStates.barbarians).money
			const roguesBefore = requireTestValue(state.playerStates.rogues).money
			const next = advanceTurn(state).state
			expect(requireTestValue(next.playerStates.barbarians).money).toBe(
				before + 2
			)
			expect(requireTestValue(next.playerStates.rogues).money).toBe(
				roguesBefore
			)
		})

		it('progresses research for the ending player', () => {
			const state = setupTwoPlayerGame()
			state.playerStates.barbarians = {
				...requireTestValue(state.playerStates.barbarians),
				researchInProgress: { tech: 'mine', turnsRemaining: 3 }
			}
			const next = advanceTurn(state).state
			expect(
				requireTestValue(next.playerStates.barbarians).researchInProgress
					?.turnsRemaining
			).toBe(2)
		})

		it('resets units only at end of round', () => {
			// barbarians → rogues. After advanceTurn the round ends and units reset.
			const board = createTestBoard(radius)
			requireTestValue(board[1])[1] = {
				...requireTestValue(requireTestValue(board[1])[1]),
				item: createTestVillage('barbarians')
			}
			requireTestValue(board[3])[3] = {
				...requireTestValue(requireTestValue(board[3])[3]),
				item: createTestVillage('rogues')
			}
			const unit = createTestUnit('barbarians', 'caveman')
			requireTestValue(board[2])[2] = {
				...requireTestValue(requireTestValue(board[2])[2]),
				unit
			}
			const unitStates: UnitStateRecord = {
				[unit.id]: createTestUnitState({ q_idx: 2, r_idx: 2 }, 'caveman', {
					mode: 'acted'
				})
			}
			const state = createTestGameState({
				board,
				unitStates,
				currentPlayerTribe: 'rogues' // last in rotation → end-of-round
			})
			const next = advanceTurn(state).state
			expect(next.units.unitStates[unit.id]?.mode).toBe('ready')
		})

		it('commits exploration for the ending player', () => {
			const state = setupTwoPlayerGame()
			const tribe = state.currentPlayerTribe
			const next = advanceTurn(state).state
			// commitFromFrame merges the visible village range into
			// playerStates[tribe].exploration. The starting village (1,1) must
			// land in exploration after the turn advance.
			expect(
				Object.keys(requireTestValue(next.playerStates[tribe]).exploration)
					.length
			).toBeGreaterThan(
				Object.keys(requireTestValue(state.playerStates[tribe]).exploration)
					.length
			)
		})

		it('clears pendingVillageLevelUps after committing them', () => {
			const board = createTestBoard(radius)
			requireTestValue(board[2])[2] = {
				...requireTestValue(requireTestValue(board[2])[2]),
				item: createTestVillage('barbarians')
			}
			const state = createTestGameState({
				board,
				pendingVillageLevelUps: { barbarians: 2 }
			})
			const next = advanceTurn(state).state
			expect(next.pendingVillageLevelUps).toEqual({})
		})
	})
})
