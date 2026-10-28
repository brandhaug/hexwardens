import { updateTile } from '../../../tile/tile'
import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt
} from '../../../test/game-test-helpers'
import { Result } from 'effect'
import { type BoardPosition } from '../../../board/board'
import { dispatch } from '../../../dispatch'
import { tribeToTribeStats } from '../../../domains/tribe'
import { heroUnitTypes } from '../../../domains/unit'
import { type PendingPerkChoice } from '../../../game'
import { editPlayer } from '../../../player/player-state'
import { advanceTurn } from '../../../turns'
import { planAction } from '../../engine'

const at: BoardPosition = { q_idx: 2, r_idx: 2 }

function setupVillage(opts: {
	pending?: PendingPerkChoice[]
	level?: 1 | 2 | 5
}) {
	const board = createTestBoard(2)
	requireTestValue(board[at.r_idx])[at.q_idx] = {
		...requireTestValue(requireTestValue(board[at.r_idx])[at.q_idx]),
		item: createTestVillage('barbarians', { level: opts.level ?? 5 })
	}
	const baseState = createTestGameState({
		board,
		pendingPerkChoices: opts.pending ? { barbarians: opts.pending } : {}
	})
	return baseState
}

describe('planAction (selectPerk)', () => {
	it('allows the head-of-queue perk choice on the matching Village', () => {
		const state = setupVillage({
			pending: [
				{
					villagePosition: at,
					level: 5,
					options: ['special_unit', 'extra_money']
				}
			]
		})
		const plan = planAction(state, {
			kind: 'selectPerk',
			at,
			perk: 'special_unit'
		})
		expect(plan.kind).toBe('allowed')
	})

	it('denies a perk that is not in the offered options', () => {
		const state = setupVillage({
			pending: [
				{
					villagePosition: at,
					level: 2,
					options: ['expand_sight', 'extra_money']
				}
			]
		})
		const plan = planAction(state, {
			kind: 'selectPerk',
			at,
			perk: 'special_unit'
		})
		expect(plan.kind).toBe('denied')
	})

	it('denies when no Perk choice is pending', () => {
		const state = setupVillage({})
		const plan = planAction(state, {
			kind: 'selectPerk',
			at,
			perk: 'extra_money'
		})
		expect(plan.kind).toBe('denied')
	})

	it('denies a perk targeted at a different Village than the queue head', () => {
		const otherPos: BoardPosition = { q_idx: 3, r_idx: 2 }
		const state = setupVillage({
			pending: [
				{
					villagePosition: otherPos,
					level: 2,
					options: ['expand_sight', 'extra_money']
				}
			]
		})
		const plan = planAction(state, {
			kind: 'selectPerk',
			at,
			perk: 'extra_money'
		})
		expect(plan.kind).toBe('denied')
	})
})

describe('selectPerk dispatch (special_unit summons the Hero)', () => {
	it('spawns the tribe Hero on the Village tile in mode acted', () => {
		const state = setupVillage({
			pending: [
				{
					villagePosition: at,
					level: 5,
					options: ['special_unit', 'extra_money']
				}
			]
		})
		const result = dispatch(state, 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'selectPerk', at, perk: 'special_unit' }
		})
		expect(Result.isSuccess(result)).toBe(true)
		assert(Result.isSuccess(result))
		const next = result.success.nextState
		const tile = next.units.board[at.r_idx]?.[at.q_idx]
		expect(tile?.unit?.type).toBe(tribeToTribeStats.barbarians.heroUnit)
		expect(tile?.unit?.tribe).toBe('barbarians')
		const heroId = tile?.unit?.id
		expect(heroId).toBeDefined()
		assert(heroId)
		expect(next.units.unitStates[heroId]?.mode).toBe('acted')
		expect(next.pendingPerkChoices.barbarians).toEqual([])
		const village = tile.item
		expect(village?.type).toBe('village')
		assert(village?.type === 'village')
		expect(village.perks).toContain('special_unit')
	})

	it('refuses to summon when the Village tile is occupied (denied at planning)', () => {
		const state = setupVillage({
			pending: [{ villagePosition: at, level: 5, options: ['special_unit'] }]
		})
		// Park a friendly unit on the Village tile to block summoning.
		const blockingUnit = createTestUnit('barbarians', 'caveman')
		const stateWithUnit = {
			...state,
			units: {
				...state.units,
				board: updateTile(state.units.board, at, { unit: blockingUnit }),
				unitStates: {
					...state.units.unitStates,
					[blockingUnit.id]: createTestUnitState(at, 'caveman')
				}
			}
		}
		const plan = planAction(stateWithUnit, {
			kind: 'selectPerk',
			at,
			perk: 'special_unit'
		})
		expect(plan.kind).toBe('denied')
		// Pending queue stays intact so the Player can move the unit and retry.
		expect(stateWithUnit.pendingPerkChoices.barbarians).toHaveLength(1)
	})
})

describe('train action denial covers every Hero unit type', () => {
	it.each(heroUnitTypes)('denies train-%s', (heroType) => {
		const board = createTestBoard(2)
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...requireTestValue(requireTestValue(board[at.r_idx])[at.q_idx]),
			item: createTestVillage('barbarians', { level: 5 })
		}
		const baseState = createTestGameState({ board })
		const state = {
			...baseState,
			playerStates: editPlayer(baseState.playerStates, 'barbarians', (draft) =>
				draft.credit(50)
			)
		}
		const plan = planAction(state, {
			kind: 'train',
			at,
			unit: heroType
		})
		expect(plan.kind).toBe('denied')
	})
})

describe('captured Village preserves prior owner perks', () => {
	it('preserves the perks array through capture (cannot retro-summon Hero)', () => {
		const board = createTestBoard(2)
		// Rogues owns a level-5 Village that already chose extra_money. After
		// the two-step flip, the captured-village rule says barbarians cannot
		// retro-summon a hero from it.
		requireTestValue(board[at.r_idx])[at.q_idx] = {
			...requireTestValue(requireTestValue(board[at.r_idx])[at.q_idx]),
			item: createTestVillage('rogues', {
				level: 5,
				perks: ['extra_money'],
				captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
			})
		}
		// Place a barbarian caveman on the Village tile (it set up the capture).
		const captor = createTestUnit('barbarians', 'caveman')
		setUnitAt(board, at, captor)
		// Rogues is current; rogues's turn ends → barbarians starts; flip fires.
		const state = createTestGameState({
			board,
			unitStates: {
				[captor.id]: createTestUnitState(at, 'caveman', { mode: 'acted' })
			},
			currentPlayerTribe: 'rogues'
		})

		const next = advanceTurn(state).state

		const village = next.units.board[at.r_idx]?.[at.q_idx]?.item
		expect(village?.type).toBe('village')
		assert(village?.type === 'village')
		expect(village.tribe).toBe('barbarians')
		// Inherited perks survive — captor cannot retroactively pick special_unit.
		expect(village.perks).toEqual(['extra_money'])
		// And no pending perk choice was created for barbarians.
		expect(next.pendingPerkChoices.barbarians ?? []).toEqual([])
	})
})

describe('city reward effects', () => {
	it('credits immediate gold without changing recurring income', () => {
		const state = setupVillage({
			level: 2,
			pending: [{ villagePosition: at, level: 2, options: ['instant_gold'] }]
		})
		const beforeMoney = state.playerStates.barbarians?.money ?? 0
		const beforeCity = state.units.board[2]?.[2]?.item
		const result = Result.getOrThrow(
			dispatch(state, 'barbarians', {
				kind: 'tileAction',
				action: { kind: 'selectPerk', at, perk: 'instant_gold' }
			})
		).nextState
		const city = result.units.board[2]?.[2]?.item
		assert(city?.type === 'village' && beforeCity?.type === 'village')
		expect(result.playerStates.barbarians?.money).toBe(beforeMoney + 5)
		expect(city.salary).toBe(beforeCity.salary)
	})

	it('adds capacity without manufacturing occupied slots', () => {
		const state = setupVillage({
			pending: [
				{ villagePosition: at, level: 3, options: ['increase_population'] }
			]
		})
		const before = state.units.board[2]?.[2]?.item
		assert(before?.type === 'village')
		const next = Result.getOrThrow(
			dispatch(state, 'barbarians', {
				kind: 'tileAction',
				action: { kind: 'selectPerk', at, perk: 'increase_population' }
			})
		).nextState
		const city = next.units.board[2]?.[2]?.item
		assert(city?.type === 'village')
		expect(city.maxPopulation).toBe(before.maxPopulation + 2)
		expect(city.population).toBe(before.population)
	})

	it('keeps the new reward prompt when a festival earns another level', () => {
		const state = setupVillage({
			level: 2,
			pending: [
				{ villagePosition: at, level: 2, options: ['extra_experience'] }
			]
		})
		const next = Result.getOrThrow(
			dispatch(state, 'barbarians', {
				kind: 'tileAction',
				action: { kind: 'selectPerk', at, perk: 'extra_experience' }
			})
		).nextState
		expect(next.pendingPerkChoices.barbarians).toEqual([
			{
				villagePosition: at,
				level: 3,
				options: ['increase_population', 'expand_range']
			}
		])
	})
})
