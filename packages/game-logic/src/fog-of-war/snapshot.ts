import { Result } from 'effect'
import { positionKey } from '../board/position'
import { createGameWorld } from '../engine/world'
import { type GameWorld } from '../engine/world-contract'
import { type Tribe } from '../domains/tribe'
import { type GameState, type TileGrid } from '../game'
import { type PlayerRead } from '../player/player-state'
import { typedFromEntries } from '../type-utils'
import {
	SchemaViolationError,
	ViewerTribeMissingError,
	type FogProjectionError
} from './errors'
import {
	validateFilteredGameState,
	type FilteredGameState,
	type FilteredTileGrid,
	type FogTile
} from './schema'
import { visibleTileIdsFromEntries } from './visibility'

export type TileKey = string

type FogTiles = ReadonlyMap<TileKey, ReturnType<GameWorld['tiles']>[number]>

/**
 * A tribe-scoped fog-of-war snapshot. Carries the visibility set for `tribe`
 * derived from a specific `GameState` together with the schema-validated
 * `FilteredGameState` the server would broadcast. The source state is bound
 * into the snapshot so {@link commitExploration} cannot be misapplied to a
 * mutated state — the type system simply doesn't accept a state argument.
 *
 * `projected` is `Result.Result<FilteredGameState, FogProjectionError>` so callers
 * can report a schema violation and withhold the invalid projection.
 */
export interface FogSnapshot {
	readonly tribe: Tribe
	readonly visibleTileIds: ReadonlySet<TileKey>
	readonly projected: Result.Result<FilteredGameState, FogProjectionError>
	readonly sourceState: GameState
}

/**
 * Build a {@link FogSnapshot} for `(state, tribe)`. Computes the visibility
 * set once and pre-projects the wire payload. Deterministic: same input
 * produces identical `visibleTileIds` and (on success) identical `projected`.
 */
export function snapshotFor(state: GameState, tribe: Tribe): FogSnapshot {
	const imported = Result.try({
		try: () => createGameWorld(state),
		catch: () => {
			const issue = validateFilteredGameState(state, tribe)
			return new SchemaViolationError({
				tribe,
				path: Result.isFailure(issue) ? [...issue.failure.path] : [],
				message: Result.isFailure(issue)
					? issue.failure.message
					: 'Inconsistent world entities'
			})
		}
	})
	if (Result.isFailure(imported)) {
		return {
			tribe,
			sourceState: state,
			visibleTileIds: new Set(),
			projected: Result.fail(imported.failure)
		}
	}
	const world = imported.success
	const tiles: FogTiles = new Map(
		world.tiles().map((entry) => [positionKey(entry.at), entry])
	)
	const visibleTileIds = visibleTileIdsFromEntries(
		tiles,
		world.units(tribe),
		tribe,
		world.player(tribe)?.researchedTechs ?? []
	)
	const projected = project(
		world,
		state.units.board,
		tribe,
		visibleTileIds,
		tiles
	)
	return { tribe, visibleTileIds, projected, sourceState: state }
}

/**
 * Permanently record the snapshot's visible tiles in that tribe's
 * `exploration` record on the snapshot's source state. Once a tile is in the
 * record, future projections keep its static terrain revealed for that tribe;
 * live entities still require current sight. Idempotent — already-explored
 * tiles stay explored. Stale-state misuse is prevented at the type level:
 * the snapshot is the only key, no separate state argument is accepted.
 */
export function commitExploration(snapshot: FogSnapshot): GameState {
	const previous = committedSnapshots.get(snapshot)
	if (previous) {
		return previous
	}
	const committed = mergeKeys(
		snapshot.sourceState,
		snapshot.tribe,
		snapshot.visibleTileIds
	)
	committedSnapshots.set(snapshot, committed)
	return committed
}

const committedSnapshots = new WeakMap<FogSnapshot, GameState>()

/**
 * Apply an exploration delta (typically emitted from `dispatch`) to the
 * tribe's exploration record. Preserves existing explored tiles — only adds
 * the keys in `delta.tiles`. Idempotent across replays.
 */
export function mergeIncomingExploration(
	state: GameState,
	delta: { tribe: Tribe; tiles: Iterable<TileKey> }
): GameState {
	return mergeKeys(state, delta.tribe, delta.tiles)
}

function mergeKeys(
	state: GameState,
	tribe: Tribe,
	tiles: Iterable<TileKey>
): GameState {
	const world = createGameWorld(state)
	const player = world.player(tribe)
	if (!player) {
		return state
	}
	const additions = [...tiles].filter((key) => !player.exploration[key])
	if (additions.length === 0) {
		return state
	}
	world.editPlayer(tribe, (draft) => {
		draft.exploreTiles(additions)
	})
	return world.snapshot()
}

function project(
	world: GameWorld,
	geometry: TileGrid,
	tribe: Tribe,
	visible: ReadonlySet<TileKey>,
	tiles: FogTiles
): Result.Result<FilteredGameState, FogProjectionError> {
	const player = world.player(tribe)
	if (!player) {
		return Result.fail(
			new ViewerTribeMissingError({
				tribe,
				message: `Viewer tribe "${tribe}" has no player state`
			})
		)
	}
	// Once a tile is explored it stays fully revealed for that tribe — terrain,
	// units, items, and unitStates all ship as-is. The fog of war does not come
	// back. Union the current sight set with the persisted exploration record
	// so the wire payload exposes everything the player has ever seen.
	const reveal = new Set<TileKey>(visible)
	for (const key of Object.keys(player.exploration)) {
		reveal.add(key)
	}
	const { seed, ...rest } = world.metadata()
	// The seed must never cross the fog boundary.
	void seed
	const projected = {
		...rest,
		units: {
			board: projectBoard(tiles, geometry, reveal),
			unitStates: projectUnitStates(world, tribe, reveal)
		},
		playerStates: projectPlayerStates(world, tribe)
	}

	const parsed = validateFilteredGameState(projected, tribe)
	if (Result.isFailure(parsed)) {
		return Result.fail(
			new SchemaViolationError({
				tribe,
				path: [...parsed.failure.path],
				message: parsed.failure.message
			})
		)
	}
	return Result.succeed(parsed.success)
}

function projectBoard(
	tiles: FogTiles,
	board: TileGrid,
	reveal: ReadonlySet<TileKey>
): FilteredTileGrid {
	return board.map((row, r_idx) =>
		row.map((_, q_idx) => {
			const key = positionKey({ q_idx, r_idx })
			const tile = tiles.get(key)?.tile
			if (!tile) {
				return null
			}
			if (reveal.has(key)) {
				return tile
			}
			const fogged: FogTile = {
				hex: tile.hex,
				terrain: null,
				item: null,
				unit: null,
				isMountain: false,
				obstacle: null
			}
			return fogged
		})
	)
}

function projectUnitStates(
	world: GameWorld,
	tribe: Tribe,
	visible: ReadonlySet<TileKey>
) {
	return typedFromEntries(
		world
			.units()
			.flatMap(({ unit, state }) =>
				unit.tribe === tribe || visible.has(positionKey(state.position))
					? [
							[
								unit.id,
								unit.tribe === tribe ? state : { ...state, homeVillage: null }
							]
						]
					: []
			)
	)
}

function projectPlayerStates(world: GameWorld, tribe: Tribe) {
	const entries = world
		.players()
		.map((state): [Tribe, PlayerRead] => [
			state.tribe,
			state.tribe === tribe
				? state
				: { ...state, exploration: {}, researchInProgress: null }
		])
	return typedFromEntries(entries)
}
