import { resolveCaptureSetups } from './features/capture/lifecycle'
import { snapshotFor } from '../fog-of-war/snapshot'
import { Result } from 'effect'
import { type ActionIntent } from './intent'
import { dispatch } from '../dispatch'
import {
	createTestBoard,
	createTestGameState,
	createTestVillage,
	createTestUnit,
	createTestUnitState
} from '../test/game-test-helpers'
import { updateTile } from '../tile/tile'
import { unitsLow } from '../units/registry'
import { advanceTurn } from '../turns'

const home = { q_idx: 3, r_idx: 3 }
const enemy = { q_idx: 5, r_idx: 3 }
function setup() {
	let board = updateTile(createTestBoard(3), home, {
		item: createTestVillage('barbarians')
	})
	board = updateTile(board, enemy, { item: createTestVillage('rogues') })
	return createTestGameState({ board })
}

describe('ownership on direct dispatch', () => {
	const enemyVillageActions: ActionIntent[] = [
		{ kind: 'train', at: enemy, unit: 'caveman' },
		{ kind: 'research', at: enemy, tech: 'guard' },
		{ kind: 'selectPerk', at: enemy, perk: 'instant_gold' }
	]

	it.each(enemyVillageActions)(
		'rejects $kind at an enemy village without mutating state',
		(action) => {
			const state = setup()
			state.pendingPerkChoices = {
				barbarians: [
					{ villagePosition: enemy, level: 2, options: ['instant_gold'] }
				]
			}
			const before = structuredClone(state)
			expect(
				Result.isFailure(
					dispatch(state, 'barbarians', { kind: 'tileAction', action })
				)
			).toBe(true)
			expect(state).toEqual(before)
		}
	)
	const enemyUnitActions: ActionIntent[] = [
		'capture',
		'explore',
		'heal',
		'recover',
		'retire'
	].map((kind) => {
		// Explicit cases preserve the action discriminant at the test boundary.
		switch (kind) {
			case 'capture': {
				return { kind: 'capture', at: home }
			}
			case 'explore': {
				return { kind: 'explore', at: home }
			}
			case 'heal': {
				return { kind: 'heal', at: home }
			}
			case 'recover': {
				return { kind: 'recover', at: home }
			}
			default: {
				return { kind: 'retire', at: home }
			}
		}
	})

	it.each(enemyUnitActions)('rejects $kind with an enemy unit', (action) => {
		const state = setup()
		const unit = createTestUnit('rogues', 'caveman')
		state.units = unitsLow.spawn(
			state.units,
			home,
			unit,
			createTestUnitState(home, 'caveman', { health: 5 })
		)
		expect(
			Result.isFailure(
				dispatch(state, 'barbarians', { kind: 'tileAction', action })
			)
		).toBe(true)
	})
})

describe('recruited units and city capacity', () => {
	it('waits until the next turn, then frees its home slot when removed elsewhere', () => {
		const initial = setup()
		const result = Result.getOrThrow(
			dispatch(initial, 'barbarians', {
				kind: 'tileAction',
				action: { kind: 'train', at: home, unit: 'caveman' }
			})
		)
		const state = result.nextState
		const unit = state.units.board[3]?.[3]?.unit
		assert(unit)
		expect(state.units.unitStates[unit.id]?.mode).toBe('acted')
		expect(state.units.unitStates[unit.id]?.homeVillage).toEqual(home)
		expect(
			Result.isFailure(
				dispatch(state, 'barbarians', {
					kind: 'move',
					from: home,
					to: { q_idx: 3, r_idx: 4 }
				})
			)
		).toBe(true)
		const nextTurn = advanceTurn(advanceTurn(state).state).state
		expect(nextTurn.units.unitStates[unit.id]?.mode).toBe('ready')
		const moved = unitsLow.move(nextTurn.units, unit.id, { q_idx: 3, r_idx: 4 })
		const removed = unitsLow.remove(moved, unit.id)
		const city = removed.board[3]?.[3]?.item
		assert(city?.type === 'village')
		expect(city.population).toBe(0)
		expect(removed.unitStates[unit.id]).toBeUndefined()
		expect(initial.units.board[3]?.[3]?.unit).toBeNull()
	})
})

it('a combat death releases the recorded city slot', () => {
	const recruited = Result.getOrThrow(
		dispatch(setup(), 'barbarians', {
			kind: 'tileAction',
			action: { kind: 'train', at: home, unit: 'caveman' }
		})
	).nextState
	const defender = recruited.units.board[3]?.[3]?.unit
	assert(defender)
	const attacker = createTestUnit('rogues', 'archer')
	const from = { q_idx: 4, r_idx: 3 }
	const units = unitsLow.spawn(
		unitsLow.setHealth(recruited.units, defender.id, 1),
		from,
		attacker,
		createTestUnitState(from, 'archer')
	)
	const state = { ...recruited, units, currentPlayerTribe: attacker.tribe }
	const next = Result.getOrThrow(
		dispatch(state, 'rogues', { kind: 'attack', from, to: home })
	).nextState
	const city = next.units.board[3]?.[3]?.item
	assert(city?.type === 'village')
	expect(city.population).toBe(0)
	expect(next.units.unitStates[defender.id]).toBeUndefined()
})

it('capture releases the former roster and removes only the lost city rewards', () => {
	const state = setup()
	const survivorPosition = { q_idx: 4, r_idx: 3 }
	const survivor = createTestUnit('rogues', 'caveman')
	const capturer = createTestUnit('barbarians', 'caveman')
	const secondCity = { q_idx: 5, r_idx: 2 }
	let units = unitsLow.spawn(
		state.units,
		survivorPosition,
		survivor,
		createTestUnitState(survivorPosition, 'caveman', { homeVillage: enemy })
	)
	units = unitsLow.spawn(
		units,
		enemy,
		capturer,
		createTestUnitState(enemy, 'caveman', { homeVillage: home })
	)
	let board = updateTile(units.board, enemy, {
		item: createTestVillage('rogues', {
			population: 1,
			captureSetup: { byTribe: 'barbarians', turnInitiated: 1 }
		})
	})
	board = updateTile(board, secondCity, { item: createTestVillage('rogues') })
	state.units = { ...units, board }
	state.pendingPerkChoices = {
		rogues: [
			{ villagePosition: enemy, level: 2, options: ['instant_gold'] },
			{ villagePosition: secondCity, level: 2, options: ['instant_gold'] }
		]
	}
	const next = resolveCaptureSetups(state).state
	const city = next.units.board[3]?.[5]?.item
	assert(city?.type === 'village')
	expect(city.population).toBe(0)
	expect(city.tribe).toBe('barbarians')
	expect(next.units.unitStates[survivor.id]?.homeVillage).toBeNull()
	expect(next.pendingPerkChoices.rogues).toEqual([
		{ villagePosition: secondCity, level: 2, options: ['instant_gold'] }
	])
})

it('does not reveal an enemy unit recruitment city over the fog boundary', () => {
	const state = setup()
	const at = { q_idx: 4, r_idx: 3 }
	const unit = createTestUnit('rogues', 'caveman')
	state.units = unitsLow.spawn(
		state.units,
		at,
		unit,
		createTestUnitState(at, 'caveman', { homeVillage: enemy })
	)
	const projected = Result.getOrThrow(
		snapshotFor(state, 'barbarians').projected
	)
	expect(projected.units.unitStates[unit.id]?.homeVillage).toBeNull()
	expect(state.units.unitStates[unit.id]?.homeVillage).toEqual(enemy)
})
