import { assertBoardUnitStatesConsistency } from '../board/unit-placement'
import { InsufficientFundsError } from '../player/player-state'
import {
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	requireTestValue
} from '../test/game-test-helpers'
import { createGameWorld } from './world'
import { decodeGameSnapshot } from './world-schema'

describe('normalized command world', () => {
	it('preserves ragged board dimensions and null cells after a commit', () => {
		const input = createTestGameState()
		input.units = {
			board: [[], [null, input.units.board[0]?.[0] ?? null], []],
			unitStates: {}
		}
		const world = createGameWorld(input)
		world.updateMetadata({ turn: 2 })
		expect(world.snapshot().units.board).toEqual(input.units.board)
	})

	it('rejects an occupied move without losing either indexed occupant', () => {
		const world = createGameWorld(createTestGameState())
		const first = createTestUnit('barbarians', 'guard', 'unit_first')
		const second = createTestUnit('rogues', 'guard', 'unit_second')
		const from = { q_idx: 0, r_idx: 0 }
		const to = { q_idx: 1, r_idx: 0 }
		world.spawnUnit(first, createTestUnitState(from, 'guard'))
		world.spawnUnit(second, createTestUnitState(to, 'guard'))
		const before = world.snapshot()
		expect(() => world.moveUnit(first.id, to)).toThrow('occupied destination')
		expect(world.tile(from)?.unit?.id).toBe(first.id)
		expect(world.tile(to)?.unit?.id).toBe(second.id)
		expect(world.snapshot()).toEqual(before)
	})

	it('preserves no-op identity and isolates input and projections', () => {
		const input = createTestGameState()
		const world = createGameWorld(input)
		world.updateMetadata({ turn: input.turn })
		world.editPlayer('barbarians', (draft) => draft.credit(0))
		expect(world.snapshot()).toBe(input)
		input.seed = 99
		expect(world.metadata().seed).toBe(12_345)
		world.updateMetadata({ turn: 2 })
		const snapshot = world.snapshot()
		delete snapshot.playerStates.barbarians
		expect(world.player('barbarians')).toBeDefined()
		expect(input.turn).toBe(1)
	})

	it('joins units from authoritative positions, orders by position, and releases capacity once', () => {
		const input = createTestGameState()
		const world = createGameWorld(input)
		const home = { q_idx: 0, r_idx: 0 }
		world.updateTile(home, {
			item: createTestVillage('barbarians', { population: 2 })
		})
		const later = createTestUnit('barbarians', 'guard', 'unit_later')
		const first = createTestUnit('rogues', 'guard', 'unit_first')
		world.spawnUnit(
			later,
			createTestUnitState({ q_idx: 3, r_idx: 2 }, 'guard', {
				homeVillage: home
			})
		)
		world.spawnUnit(first, createTestUnitState({ q_idx: 1, r_idx: 0 }, 'guard'))
		expect(world.units().map(({ unit }) => unit.id)).toEqual([
			first.id,
			later.id
		])
		world.moveUnit(later.id, { q_idx: 0, r_idx: 1 })
		expect(world.tile({ q_idx: 3, r_idx: 2 })?.unit).toBeNull()
		expect(world.tile({ q_idx: 0, r_idx: 1 })?.unit?.id).toBe(later.id)
		world.removeUnit(later.id)
		const village = world.tile(home)?.item
		expect(village?.type === 'village' && village.population).toBe(1)
		expect(() => world.removeUnit(later.id)).toThrow('removeUnit: missing')
		const snapshot = world.snapshot()
		assertBoardUnitStatesConsistency(
			snapshot.units.board,
			snapshot.units.unitStates
		)
		expect(Object.keys(input.units.unitStates)).toEqual([])
	})

	it('rejects failed edits without changing input or the workspace', () => {
		const input = createTestGameState()
		const world = createGameWorld(input)
		expect(() =>
			world.editPlayer('barbarians', (draft) => {
				draft.credit(1)
				draft.spend(100)
			})
		).toThrow(InsufficientFundsError)
		expect(world.snapshot()).toBe(input)
		const unit = createTestUnit('barbarians', 'guard', 'unit_one')
		world.spawnUnit(unit, createTestUnitState({ q_idx: 0, r_idx: 0 }, 'guard'))
		const before = world.snapshot()
		expect(() =>
			world.spawnUnit(
				unit,
				createTestUnitState({ q_idx: 1, r_idx: 0 }, 'guard')
			)
		).toThrow('spawnUnit: duplicate')
		expect(() => world.moveUnit(unit.id, { q_idx: 99, r_idx: 99 })).toThrow(
			'destination has no tile'
		)
		expect(world.snapshot()).toEqual(before)
	})

	it('preserves player insertion order and decodes persisted snapshots', () => {
		const input = createTestGameState()
		input.playerStates = {
			rogues: requireTestValue(input.playerStates.rogues),
			barbarians: requireTestValue(input.playerStates.barbarians)
		}
		const world = createGameWorld(input)
		expect(world.players().map((player) => player.tribe)).toEqual([
			'rogues',
			'barbarians'
		])
		const json = JSON.stringify(input)
		const serialized: unknown = JSON.parse(json)
		expect(decodeGameSnapshot(serialized)).toEqual(serialized)
		expect(() => decodeGameSnapshot({ ...input, seed: 'invalid' })).toThrow(
			/seed/
		)
	})
})
