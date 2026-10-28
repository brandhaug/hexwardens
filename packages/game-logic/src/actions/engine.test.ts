import { Schema } from 'effect'
import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from '../test/game-test-helpers'
import { type BoardPosition } from '../board/board'
import { type PrimaryBuilding } from '../domains/primary-building'
import { type Resource } from '../domains/resource'
import { type Ruins } from '../domains/ruins'
import { type SecondaryBuilding } from '../domains/secondary-building'
import { unitToUnitStats, type UnitState } from '../domains/unit'
import { editPlayer } from '../player/player-state'
import { type TileState } from '../tile/tile'
import { type UnitStateRecord } from '../unit-state-utils'
import {
	availableActions,
	executePlan,
	planAction,
	plansToOptions
} from './engine'
import {
	type ActionIntent,
	type ActionPlan,
	type AllowedActionPlan
} from './intent'

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

function executeAllowed(
	state: ReturnType<typeof createTestGameState>,
	intent: ActionIntent
) {
	const plan = planAction(state, intent)
	assert(plan.kind === 'allowed')
	const result = executePlan(state, plan)
	return { newGameState: result.state, message: result.message }
}

describe('planAction (build)', () => {
	function setupPrimaryBuild(money?: number) {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const primary: PrimaryBuilding = {
			type: 'primaryBuilding',
			value: 'farm',
			state: 'idle',
			tribe: null
		}
		placeAt(board, at, { item: primary })
		// Friendly village adjacent so `isWithinVillageRange` resolves true.
		const villagePos: BoardPosition = { q_idx: 1, r_idx: 2 }
		const village = createTestVillage('barbarians', { range: 2 })
		placeAt(board, villagePos, { item: village })
		let state = createTestGameState({ board })
		if (money !== undefined) {
			state = {
				...state,
				playerStates: editPlayer(state.playerStates, 'barbarians', (draft) => {
					draft.credit(money - 5)
				})
			}
		}
		state.playerStates.barbarians = {
			...requireTestValue(state.playerStates.barbarians),
			researchedTechs: ['farming']
		}
		return { state, at }
	}

	it('produces an allowed plan with cost and preview when ready', () => {
		const { state, at } = setupPrimaryBuild(50)
		const plan = planAction(state, { kind: 'build', at })
		expect(plan.kind).toBe('allowed')
		assert(plan.kind === 'allowed')
		expect(plan.cost.gold).toBeGreaterThan(0)
		expect(plan.preview.actionType).toBe('build')
	})

	it('denies with insufficientFunds when player cannot afford', () => {
		const { state, at } = setupPrimaryBuild(0)
		const plan = planAction(state, { kind: 'build', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('insufficientFunds')
	})

	it('denies a tile outside the acting tribe territory', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const state = createTestGameState({ board })
		const plan = planAction(state, { kind: 'build', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('invalidTarget')
	})

	it('does not surface upgrade options on the build action — Large is its own action', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const secondary: SecondaryBuilding = {
			type: 'secondaryBuilding',
			value: 'stables',
			state: 'built',
			tribe: 'barbarians'
		}
		placeAt(board, at, { item: secondary })
		placeAt(
			board,
			{ q_idx: 1, r_idx: 2 },
			{
				item: createTestVillage('barbarians', { range: 2 })
			}
		)
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}

		const plan = planAction(state, { kind: 'build', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('noActionAvailable')
	})
})

describe('planAction (upgrade-to-large)', () => {
	function setupLargeUpgrade(opts: {
		mastery?: 'fire_mastery' | 'plant_mastery' | 'water_mastery'
		money?: number
		secondary?: SecondaryBuilding['value']
	}) {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const secondary: SecondaryBuilding = {
			type: 'secondaryBuilding',
			value: opts.secondary ?? 'stables',
			state: 'built',
			tribe: 'barbarians'
		}
		placeAt(board, at, { item: secondary })
		placeAt(
			board,
			{ q_idx: 1, r_idx: 2 },
			{
				item: createTestVillage('barbarians', { range: 2 })
			}
		)
		const baseState = createTestGameState({ board })
		const startingMoney = requireTestValue(
			baseState.playerStates.barbarians
		).money
		const targetMoney = opts.money ?? 50
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					if (targetMoney >= startingMoney) {
						draft.credit(targetMoney - startingMoney)
					} else {
						draft.spend(startingMoney - targetMoney)
					}
					if (opts.mastery) {
						draft.startResearch(opts.mastery, 0)
						draft.completeResearch()
					}
				}
			)
		}
		return { state, at }
	}

	it('allows upgrading stables to Large with fire_mastery', () => {
		const { state, at } = setupLargeUpgrade({ mastery: 'fire_mastery' })
		const plan = planAction(state, { kind: 'upgrade-to-large', at })
		expect(plan.kind).toBe('allowed')
		assert(plan.kind === 'allowed')
		expect(plan.preview.label).toContain('Large')
	})

	it('denies missingTech without the corresponding Mastery', () => {
		const { state, at } = setupLargeUpgrade({})
		const plan = planAction(state, { kind: 'upgrade-to-large', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('missingTech')
		assert(plan.reason.kind === 'missingTech')
		expect(plan.reason.tech).toBe('fire_mastery')
	})

	it('denies upgrading a building owned by another tribe', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const secondary: SecondaryBuilding = {
			type: 'secondaryBuilding',
			value: 'stables',
			state: 'built',
			tribe: 'rogues'
		}
		placeAt(board, at, { item: secondary })
		placeAt(
			board,
			{ q_idx: 1, r_idx: 2 },
			{
				item: createTestVillage('barbarians', { range: 2 })
			}
		)
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
					draft.startResearch('fire_mastery', 0)
					draft.completeResearch()
				}
			)
		}
		const plan = planAction(state, { kind: 'upgrade-to-large', at })
		expect(plan.kind).toBe('denied')
	})

	it('denies invalidTarget when the secondary is already Large', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const secondary: SecondaryBuilding = {
			type: 'secondaryBuilding',
			value: 'stables',
			state: 'large',
			tribe: 'barbarians'
		}
		placeAt(board, at, { item: secondary })
		placeAt(
			board,
			{ q_idx: 1, r_idx: 2 },
			{
				item: createTestVillage('barbarians', { range: 2 })
			}
		)
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
					draft.startResearch('fire_mastery', 0)
					draft.completeResearch()
				}
			)
		}
		const plan = planAction(state, { kind: 'upgrade-to-large', at })
		expect(plan.kind).toBe('denied')
	})

	it('denies insufficientFunds when broke', () => {
		const { state, at } = setupLargeUpgrade({
			mastery: 'fire_mastery',
			money: 0
		})
		const plan = planAction(state, { kind: 'upgrade-to-large', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('insufficientFunds')
	})
})

describe('planAction (collect)', () => {
	function setupCollect(money: number) {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const resource: Resource = { type: 'resource', value: 'apple' }
		placeAt(board, at, { item: resource })
		// Friendly village adjacent so isWithinVillageRange resolves true.
		const village = createTestVillage('barbarians', { range: 2 })
		placeAt(board, { q_idx: 1, r_idx: 2 }, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(money - 5)
				}
			)
		}
		state.playerStates.barbarians = {
			...requireTestValue(state.playerStates.barbarians),
			researchedTechs: ['fruit_harvesting']
		}
		return { state, at }
	}

	it('allows collect when player can afford', () => {
		const { state, at } = setupCollect(10)
		const plan = planAction(state, { kind: 'collect', at })
		expect(plan.kind).toBe('allowed')
	})

	it('denies invalidTarget when no resource on tile', () => {
		const state = createTestGameState({ board: createTestBoard(2) })
		const plan = planAction(state, {
			kind: 'collect',
			at: { q_idx: 2, r_idx: 2 }
		})
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('invalidTarget')
	})

	it('denies missingTech when collecting a gated resource without its harvesting tech', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const resource: Resource = { type: 'resource', value: 'gem' }
		placeAt(board, at, { item: resource })
		const village = createTestVillage('barbarians', { range: 2 })
		placeAt(board, { q_idx: 1, r_idx: 2 }, { item: village })
		const state = createTestGameState({ board })
		const plan = planAction(state, { kind: 'collect', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('missingTech')
		assert(plan.reason.kind === 'missingTech')
		expect(plan.reason.tech).toBe('gem')
	})

	it('allows collecting a gated resource once the matching harvesting tech is researched', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const resource: Resource = { type: 'resource', value: 'gem' }
		placeAt(board, at, { item: resource })
		const village = createTestVillage('barbarians', { range: 2 })
		placeAt(board, { q_idx: 1, r_idx: 2 }, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: {
				...baseState.playerStates,
				barbarians: {
					...requireTestValue(baseState.playerStates.barbarians),
					researchedTechs: ['gem' as const]
				}
			}
		}
		const plan = planAction(state, { kind: 'collect', at })
		expect(plan.kind).toBe('allowed')
	})
})

describe('planAction (capture)', () => {
	it('allows when own ready unit is on enemy village', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('rogues', { population: 0 })
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { item: village, unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'capture', at })
		expect(plan.kind).toBe('allowed')
	})

	it('denies unitNotReady when unit has acted', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('rogues', { population: 0 })
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { item: village, unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { mode: 'acted' })
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'capture', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('unitNotReady')
	})
})

describe('planAction (recover)', () => {
	it('allows a wounded unit owned by the current tribe to recover', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const fullHp = unitToUnitStats.caveman.health
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { health: fullHp - 6 })
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'recover', at })
		expect(plan.kind).toBe('allowed')
	})

	it('denies invalidTarget when unit already at full health', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const fullHp = unitToUnitStats.caveman.health
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { health: fullHp })
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'recover', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('invalidTarget')
	})

	it('denies unitNotReady when unit has already acted this turn', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', {
				health: 5,
				mode: 'acted'
			})
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'recover', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('unitNotReady')
	})

	it('restores +4 HP outside territory and marks the unit as acted', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const fullHp = unitToUnitStats.caveman.health
		const startHp = fullHp - 4
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { health: startHp })
		}
		const state = createTestGameState({ board, unitStates })
		const result = executeAllowed(state, { kind: 'recover', at })
		const next = result.newGameState.units.unitStates[unit.id]
		expect(next?.health).toBe(Math.min(fullHp, startHp + 4))
		expect(next?.mode).toBe('acted')
	})

	it('restores +4 HP outside territory even when at or below 50%', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const fullHp = unitToUnitStats.caveman.health
		const startHp = Math.floor(fullHp / 2)
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { health: startHp })
		}
		const state = createTestGameState({ board, unitStates })
		const result = executeAllowed(state, { kind: 'recover', at })
		const next = result.newGameState.units.unitStates[unit.id]
		expect(next?.health).toBe(Math.min(fullHp, startHp + 4))
	})
})

describe('planAction (heal)', () => {
	it('denies invalidTarget when unit at full health', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const fullHp = unitToUnitStats.caveman.health
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { health: fullHp })
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'heal', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('invalidTarget')
	})

	it('allows when damaged unit and player has gold', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const partialState: UnitState = createTestUnitState(at, 'caveman', {
			health: 1
		})
		const unitStates: UnitStateRecord = {
			[unit.id]: partialState
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'heal', at })
		expect(plan.kind).toBe('allowed')
	})
})

describe('planAction (train)', () => {
	function setupTrainContext() {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		return { state, at }
	}

	it('allows train caveman with no tech requirement', () => {
		const { state, at } = setupTrainContext()
		const plan = planAction(state, { kind: 'train', at, unit: 'caveman' })
		expect(plan.kind).toBe('allowed')
	})

	it('denies missingTech for guard without guard research', () => {
		const { state, at } = setupTrainContext()
		const plan = planAction(state, { kind: 'train', at, unit: 'guard' })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('missingTech')
	})

	it('denies populationFull when village is full', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 2,
			maxPopulation: 2
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		const plan = planAction(state, { kind: 'train', at, unit: 'caveman' })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('populationFull')
	})

	it('denies hero training at every Village level — Heroes are summoned via the level-5 perk', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			level: 5,
			population: 0,
			maxPopulation: 7
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		const plan = planAction(state, { kind: 'train', at, unit: 'berserker' })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('invalidIntent')
	})
})

describe('planAction (research)', () => {
	function setupResearchContext() {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', { population: 0 })
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		return { state, at }
	}

	it('allows research climbing with funds', () => {
		const { state, at } = setupResearchContext()
		const plan = planAction(state, { kind: 'research', at, tech: 'climbing' })
		expect(plan.kind).toBe('allowed')
	})

	it('increases research cost for each owned village beyond the first', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		placeAt(board, at, { item: createTestVillage('barbarians') })
		placeAt(
			board,
			{ q_idx: 1, r_idx: 2 },
			{
				item: createTestVillage('barbarians')
			}
		)
		placeAt(
			board,
			{ q_idx: 3, r_idx: 2 },
			{
				item: createTestVillage('barbarians')
			}
		)
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		const plan = planAction(state, { kind: 'research', at, tech: 'climbing' })
		expect(plan.kind).toBe('allowed')
		assert(plan.kind === 'allowed')
		expect(plan.cost.gold).toBe(7)
	})

	it('denies missingTech for prerequisite-locked tech', () => {
		const { state, at } = setupResearchContext()
		const plan = planAction(state, {
			kind: 'research',
			at,
			tech: 'mobility_mastery'
		})
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('missingTech')
	})
})

describe('planAction (explore)', () => {
	it('allows when ready unit on ruins', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const ruins: Ruins = { type: 'ruins', reward: 'money' }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { item: ruins, unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'explore', at })
		expect(plan.kind).toBe('allowed')
	})

	it('denies unitNotReady when unit moved already', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const ruins: Ruins = { type: 'ruins', reward: 'money' }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { item: ruins, unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman', { mode: 'moved' })
		}
		const state = createTestGameState({ board, unitStates })
		const plan = planAction(state, { kind: 'explore', at })
		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('unitNotReady')
	})

	it('credits money reward via editPlayer when exploring a money ruin', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const ruins: Ruins = { type: 'ruins', reward: 'money' }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { item: ruins, unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		const state = createTestGameState({ board, unitStates })
		const before = requireTestValue(state.playerStates.barbarians).money
		const result = executeAllowed(state, { kind: 'explore', at })
		const next = result.newGameState
		expect(requireTestValue(next.playerStates.barbarians).money).toBe(
			before + 10
		)
		expect(next.units.board[at.r_idx]?.[at.q_idx]?.item).toBeNull()
		expect(next.units.unitStates[unit.id]?.mode).toBe('acted')
	})

	it('credits treasure reward via editPlayer when exploring a unit ruin', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const ruins: Ruins = { type: 'ruins', reward: 'unit' }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { item: ruins, unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		const state = createTestGameState({ board, unitStates })
		const before = requireTestValue(state.playerStates.barbarians).money
		const result = executeAllowed(state, { kind: 'explore', at })
		expect(
			requireTestValue(result.newGameState.playerStates.barbarians).money
		).toBe(before + 5)
	})
})

describe('planAction (retire)', () => {
	it('requires guild before retiring a unit', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		const state = createTestGameState({ board, unitStates })

		const plan = planAction(state, { kind: 'retire', at })

		expect(plan.kind).toBe('denied')
		assert(plan.kind === 'denied')
		expect(plan.reason.kind).toBe('missingTech')
	})

	it('retires a ready unit for half its training cost', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		placeAt(board, at, { unit })
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(at, 'caveman')
		}
		const base = createTestGameState({ board, unitStates })
		const state = {
			...base,
			playerStates: editPlayer(base.playerStates, 'barbarians', (draft) => {
				draft.startResearch('guild', 0)
				draft.completeResearch()
			})
		}

		const plan = planAction(state, { kind: 'retire', at })
		assert(plan.kind === 'allowed')
		const before = requireTestValue(state.playerStates.barbarians).money
		const next = executePlan(state, plan).state

		expect(next.units.board[at.r_idx]?.[at.q_idx]?.unit).toBeNull()
		expect(next.units.unitStates[unit.id]).toBeUndefined()
		expect(requireTestValue(next.playerStates.barbarians).money).toBe(
			before + 1
		)
	})
})

describe('executePlan', () => {
	it('builds a primary building and deducts gold', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const primary: PrimaryBuilding = {
			type: 'primaryBuilding',
			value: 'farm',
			state: 'idle',
			tribe: null
		}
		placeAt(board, at, { item: primary })
		const village = createTestVillage('barbarians', { range: 2 })
		placeAt(board, { q_idx: 1, r_idx: 2 }, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		state.playerStates.barbarians = {
			...requireTestValue(state.playerStates.barbarians),
			researchedTechs: ['farming']
		}
		const plan = planAction(state, { kind: 'build', at })
		assert(plan.kind === 'allowed')
		const before = requireTestValue(state.playerStates['barbarians']).money
		const next = executePlan(state, plan)
		expect(
			requireTestValue(next.state.playerStates['barbarians']).money
		).toBeLessThan(before)
		const tile = next.state.units.board[2]?.[2]
		expect(tile?.item?.type).toBe('primaryBuilding')
		assert(tile?.item?.type === 'primaryBuilding')
		expect(tile.item.state).toBe('built')
		expect(tile.item.tribe).toBe('barbarians')
	})

	it('upgrades a secondary building to Large and deducts gold', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const secondary: SecondaryBuilding = {
			type: 'secondaryBuilding',
			value: 'stables',
			state: 'built',
			tribe: 'barbarians'
		}
		placeAt(board, at, { item: secondary })
		placeAt(
			board,
			{ q_idx: 1, r_idx: 2 },
			{
				item: createTestVillage('barbarians', { range: 2 })
			}
		)
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
					draft.startResearch('fire_mastery', 0)
					draft.completeResearch()
				}
			)
		}
		const plan = planAction(state, { kind: 'upgrade-to-large', at })
		assert(plan.kind === 'allowed')
		const before = requireTestValue(state.playerStates.barbarians).money
		const next = executePlan(state, plan)
		const tile = next.state.units.board[at.r_idx]?.[at.q_idx]

		expect(
			requireTestValue(next.state.playerStates.barbarians).money
		).toBeLessThan(before)
		expect(tile?.item?.type).toBe('secondaryBuilding')
		assert(tile?.item?.type === 'secondaryBuilding')
		expect(tile.item.state).toBe('large')
	})

	it('is deterministic (same input → same next state)', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		const intent: ActionIntent = { kind: 'train', at, unit: 'caveman' }
		const plan1 = planAction(state, intent)
		const plan2 = planAction(state, intent)
		assert(plan1.kind === 'allowed' && plan2.kind === 'allowed')
		const a = executePlan(state, plan1).state
		const b = executePlan(state, plan2).state
		expect(requireTestValue(a.playerStates['barbarians']).money).toBe(
			requireTestValue(b.playerStates['barbarians']).money
		)
		expect(a.units.board[2]?.[2]?.unit?.type).toBe('caveman')
		expect(b.units.board[2]?.[2]?.unit?.type).toBe('caveman')
	})

	it('charges exactly the cost the plan promised', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		const plan = planAction(state, { kind: 'train', at, unit: 'caveman' })
		assert(plan.kind === 'allowed')
		const before = requireTestValue(state.playerStates['barbarians']).money
		const next = executePlan(state, plan).state
		expect(
			before - requireTestValue(next.playerStates['barbarians']).money
		).toBe(plan.cost.gold)
	})
})

describe('availableActions', () => {
	it('returns only allowed plans (each round-trips through planAction)', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}

		const plans = availableActions(state, 'barbarians', at)
		expect(plans.length).toBeGreaterThan(0)
		for (const plan of plans) {
			expect(plan.kind).toBe('allowed')
			const replanned = planAction(state, plan.intent)
			expect(replanned.kind).toBe('allowed')
		}
	})

	it('returns empty list for an empty grass tile', () => {
		const state = createTestGameState({ board: createTestBoard(2) })
		const plans = availableActions(state, 'barbarians', { q_idx: 0, r_idx: 0 })
		expect(plans).toEqual([])
	})

	it('plansToOptions surfaces every preview as an ActionOption', () => {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		const plans = availableActions(state, 'barbarians', at)
		const options = plansToOptions(plans)
		expect(options).toHaveLength(plans.length)
		for (const opt of options) {
			expect(opt.type).toEqual(expect.any(String))
		}
	})
})

describe('availableActions (explicit previewing tribe)', () => {
	function setupRoguesVillage() {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('rogues', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		// currentPlayerTribe stays 'barbarians' — rogues is NOT the current player.
		const state = {
			...baseState,
			playerStates: editPlayer(baseState.playerStates, 'rogues', (draft) => {
				draft.credit(50)
			})
		}
		return { state, at }
	}

	it("surfaces a non-current tribe's actions when that tribe is passed explicitly", () => {
		const { state, at } = setupRoguesVillage()
		expect(state.currentPlayerTribe).toBe('barbarians')

		const plans = availableActions(state, 'rogues', at)
		expect(plans.length).toBeGreaterThan(0)
		expect(
			plans.some((plan) => plan.preview.actionType === 'train-caveman')
		).toBe(true)
	})

	it('validates against the previewing tribe player state, not the current player', () => {
		const { state, at } = setupRoguesVillage()
		// Barbarians (the current player) own no village here — asking for
		// barbarians at the rogues village yields nothing.
		const plans = availableActions(state, 'barbarians', at)
		expect(plans).toEqual([])
	})

	it('does not mutate the input state when previewing another tribe', () => {
		const { state, at } = setupRoguesVillage()
		const before = JSON.stringify(state)
		availableActions(state, 'rogues', at)
		expect(state.currentPlayerTribe).toBe('barbarians')
		expect(JSON.stringify(state)).toBe(before)
	})
})

describe('availableActions (regression fixture)', () => {
	function fundedVillageFixture() {
		const board = createTestBoard(2)
		const at: BoardPosition = { q_idx: 2, r_idx: 2 }
		const village = createTestVillage('barbarians', {
			population: 0,
			maxPopulation: 5
		})
		placeAt(board, at, { item: village })
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(
				baseState.playerStates,
				'barbarians',
				(draft) => {
					draft.credit(50)
				}
			)
		}
		return { state, at }
	}

	it('returns a stable plan set (actionType + gold cost) for a funded village', () => {
		const { state, at } = fundedVillageFixture()
		const plans = availableActions(state, 'barbarians', at)
		const fingerprint = plans
			.map((plan) => `${plan.preview.actionType}:${plan.cost.gold}`)
			.toSorted()
		expect(fingerprint).toMatchInlineSnapshot(`
			[
			  "research-cheese:5",
			  "research-clam_harvesting:5",
			  "research-climbing:5",
			  "research-fruit_harvesting:5",
			  "research-gem:5",
			  "research-meat_harvesting:5",
			  "train-caveman:2",
			]
		`)
	})

	it('returns identical results across repeated calls on the same state', () => {
		const { state, at } = fundedVillageFixture()
		const first = availableActions(state, 'barbarians', at)
		const second = availableActions(state, 'barbarians', at)
		expect(second).toEqual(first)
	})
})

const isTypedDenial = Schema.is(
	Schema.Struct({ reason: Schema.Struct({ kind: Schema.String }) })
)

describe('type-level: executePlan rejects denied plans', () => {
	it('only accepts AllowedActionPlan at compile time', () => {
		// This is a type-test. `executePlan` must reject `ActionPlan` (allowed
		// or denied) — only `AllowedActionPlan` is permitted.
		const allowed: AllowedActionPlan = {
			kind: 'allowed',
			intent: { kind: 'capture', at: { q_idx: 0, r_idx: 0 } },
			cost: { gold: 0 },
			preview: {
				actionType: 'capture',
				intent: { kind: 'capture', at: { q_idx: 0, r_idx: 0 } },
				label: 'Capture',
				variant: 'destructive'
			}
		}
		expect(allowed.kind).toBe('allowed')

		expectTypeOf<Extract<ActionPlan, { kind: 'denied' }>>().not.toExtend<
			Parameters<typeof executePlan>[1]
		>()
	})

	it('every denial reason is a typed object (no string errors)', () => {
		const state = createTestGameState({ board: createTestBoard(2) })
		const at: BoardPosition = { q_idx: 0, r_idx: 0 }
		const intents: ActionIntent[] = [
			{ kind: 'build', at },
			{ kind: 'capture', at },
			{ kind: 'collect', at },
			{ kind: 'explore', at },
			{ kind: 'heal', at },
			{ kind: 'retire', at },
			{ kind: 'train', at, unit: 'caveman' },
			{ kind: 'research', at, tech: 'climbing' }
		]
		for (const intent of intents) {
			const plan = planAction(state, intent)
			expect(plan.kind === 'allowed' || isTypedDenial(plan)).toBe(true)
		}
	})
})
