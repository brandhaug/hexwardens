import { Predicate } from 'effect'
import { type BoardPosition, positionKey } from '../board/position'
import { BoardUnitInvariantError } from '../board/unit-placement'
import { type Tribe } from '../domains/tribe'
import { type Unit, type UnitId, type UnitState } from '../domains/unit'
import { type GameState } from '../game'
import {
	editPlayer,
	UnknownTribeError,
	type PlayerState
} from '../player/player-state'
import { type TileState } from '../tile/tile'
import { type GameWorld, type WorldTile } from './world-contract'
import { decodeGameSnapshot, getWorldSchemas } from './world-schema'

// Optional undefined fields and record key order do not change gameplay data.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- structural comparison of validated plain game data
function equalData(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true
	}
	if (!Predicate.isObjectOrArray(a) || !Predicate.isObjectOrArray(b)) {
		return false
	}
	if (Array.isArray(a) !== Array.isArray(b)) {
		return false
	}
	if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
		return false
	}
	const left = Object.entries(a).filter(([, value]) => value !== undefined)
	const right = new Map(
		Object.entries(b).filter(([, value]) => value !== undefined)
	)
	return (
		left.length === right.size &&
		left.every(
			([key, value]) => right.has(key) && equalData(value, right.get(key))
		)
	)
}

/** Private normalized records. Validate each write before replacing any owned data. */
export function createGameWorld(input: GameState): GameWorld {
	const { units, playerStates, ...initialMetadata } = decodeGameSnapshot(
		structuredClone(input)
	)
	const { decodeMetadata, decodePlayer, decodeUnit, decodeTerrain } =
		getWorldSchemas()
	let metadata = initialMetadata
	let changed = false
	const tiles = new Map<string, { at: BoardPosition; tile: WorldTile }>()
	const unitRecords = new Map<UnitId, { unit: Unit; state: UnitState }>()
	const occupants = new Map<string, UnitId>()
	const players = new Map<Tribe, PlayerState>()
	for (const [r_idx, row] of units.board.entries()) {
		for (const [q_idx, tile] of row.entries()) {
			if (!tile) {
				continue
			}
			const at = { q_idx, r_idx }
			const { unit, ...terrain } = tile
			tiles.set(positionKey(at), { at, tile: terrain })
			if (unit) {
				const state = units.unitStates[unit.id]
				if (!state) {
					throw new BoardUnitInvariantError(`missing state for ${unit.id}`)
				}
				unitRecords.set(unit.id, { unit, state })
				occupants.set(positionKey(state.position), unit.id)
			}
		}
	}
	for (const player of Object.values(playerStates)) {
		players.set(player.tribe, player)
	}

	function requireUnit(id: UnitId, operation: string) {
		const entry = unitRecords.get(id)
		if (!entry) {
			throw new BoardUnitInvariantError(`${operation}: missing ${id}`)
		}
		return entry
	}
	function requireDestination(
		at: BoardPosition,
		id: UnitId,
		operation: string
	) {
		const key = positionKey(at)
		if (!tiles.has(key)) {
			throw new BoardUnitInvariantError(`${operation}: destination has no tile`)
		}
		const occupant = occupants.get(key)
		if (occupant !== undefined && occupant !== id) {
			throw new BoardUnitInvariantError(`${operation}: occupied destination`)
		}
	}
	function projectTile(key: string, tile: WorldTile): TileState {
		const id = occupants.get(key)
		return {
			...tile,
			unit: id === undefined ? null : (unitRecords.get(id)?.unit ?? null)
		}
	}
	function orderedUnits() {
		return [...unitRecords.values()].toSorted(
			(a, b) =>
				a.state.position.r_idx - b.state.position.r_idx ||
				a.state.position.q_idx - b.state.position.q_idx
		)
	}

	const world: GameWorld = {
		metadata: () => structuredClone(metadata),
		updateMetadata(update) {
			const next = decodeMetadata({ ...metadata, ...structuredClone(update) })
			if (!equalData(metadata, next)) {
				metadata = next
				changed = true
			}
		},
		tile(at) {
			const key = positionKey(at)
			const entry = tiles.get(key)
			return entry ? structuredClone(projectTile(key, entry.tile)) : null
		},
		tiles: () =>
			[...tiles].map(([key, { at, tile }]) =>
				structuredClone({ at, tile: projectTile(key, tile) })
			),
		updateTile(at, update) {
			const key = positionKey(at)
			const previous = tiles.get(key)
			if (!previous) {
				return
			}
			const tile = decodeTerrain({
				...previous.tile,
				...structuredClone(update)
			})
			if (!equalData(previous.tile, tile)) {
				tiles.set(key, { at: previous.at, tile })
				changed = true
			}
		},
		player: (tribe) => structuredClone(players.get(tribe)),
		players: () => structuredClone([...players.values()]),
		editPlayer(tribe, edit) {
			const previous = players.get(tribe)
			if (!previous) {
				throw new UnknownTribeError({ tribe })
			}
			const next = editPlayer(
				{ [tribe]: structuredClone(previous) },
				tribe,
				edit
			)[tribe]
			if (next && !equalData(previous, next)) {
				players.set(tribe, decodePlayer(next))
				changed = true
			}
		},
		unit: (id) => structuredClone(unitRecords.get(id)),
		units: (tribe) =>
			structuredClone(
				orderedUnits().filter(
					({ unit }) => tribe === undefined || unit.tribe === tribe
				)
			),
		spawnUnit(unit, state) {
			if (unitRecords.has(unit.id)) {
				throw new BoardUnitInvariantError(`spawnUnit: duplicate ${unit.id}`)
			}
			requireDestination(state.position, unit.id, 'spawnUnit')
			const next = decodeUnit(structuredClone({ unit, state }))
			unitRecords.set(unit.id, next)
			occupants.set(positionKey(next.state.position), unit.id)
			changed = true
		},
		updateUnit(id, update) {
			const previous = requireUnit(id, 'updateUnit')
			const next = decodeUnit({
				unit: previous.unit,
				state: { ...previous.state, ...structuredClone(update) }
			})
			requireDestination(next.state.position, id, 'updateUnit')
			if (!equalData(previous, next)) {
				occupants.delete(positionKey(previous.state.position))
				occupants.set(positionKey(next.state.position), id)
				unitRecords.set(id, next)
				changed = true
			}
		},
		moveUnit: (id, to) => world.updateUnit(id, { position: to }),
		removeUnit(id) {
			const { unit, state } = requireUnit(id, 'removeUnit')
			const home = state.homeVillage
			const village = home && tiles.get(positionKey(home))?.tile.item
			if (home && village?.type === 'village' && village.tribe === unit.tribe) {
				world.updateTile(home, {
					item: { ...village, population: Math.max(0, village.population - 1) }
				})
			}
			unitRecords.delete(id)
			occupants.delete(positionKey(state.position))
			changed = true
		},
		snapshot() {
			if (!changed) {
				return input
			}
			const board: (TileState | null)[][] = units.board.map((row) =>
				Array.from({ length: row.length }, () => null)
			)
			for (const [key, { at, tile }] of tiles) {
				const row = board[at.r_idx]
				if (row) {
					row[at.q_idx] = projectTile(key, tile)
				}
			}
			// Writes already validate records and preserve occupancy. Detach once at publication.
			return structuredClone({
				...metadata,
				units: {
					board,
					unitStates: Object.fromEntries(
						orderedUnits().map(({ unit, state }) => [unit.id, state])
					)
				},
				playerStates: Object.fromEntries(players)
			})
		}
	}
	return world
}
