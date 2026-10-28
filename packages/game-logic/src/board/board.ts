import { type ReadonlyData } from '../type-utils'
import { Result } from 'effect'
import { Grid } from 'honeycomb-grid'
import {
	InvalidTargetError,
	OutOfRangeError,
	UnitNotReadyError,
	type GameActionError
} from '../actions/action-errors'
import { hasTechPassive, type Tech } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { unitToUnitStats, type UnitType } from '../domains/unit'
import { type GameState } from '../game'
import { getPlayerState } from '../player/player-state'
import { updateTile, type TileGrid, type TileState } from '../tile/tile'
import { isWaterTerrain } from '../tile/tile-terrain'
import { canUnitMove } from '../validation/unit'
import { GameHex, NEIGHBOR_DIRECTIONS } from './hex-utils'
import { positionsWithin } from './position-range'
import {
	canStopOn,
	isReachable,
	type MovementContext,
	type TerrainGates
} from './movement'
import {
	type BoardPosition,
	type HexCoordinate,
	type PositionKey
} from './position'

export type { BoardPosition, HexCoordinate, PositionKey } from './position'
export { positionKey } from './position'

/**
 * Wraps a 2D tile grid and owns all coordinate math. Construct once per
 * operation via `loadBoard` — methods take public `BoardPosition` values and
 * hide array-index / cube-coord / honeycomb-grid internals.
 */
export class Board {
	readonly tiles: TileGrid
	readonly radius: number
	readonly size: number

	private constructor(tiles: TileGrid, radius: number) {
		this.tiles = tiles
		this.radius = radius
		this.size = tiles.length
	}

	static from(tiles: TileGrid): Board {
		const radius = (tiles.length - 1) / 2
		return new Board(tiles, radius)
	}

	at(pos: BoardPosition): ReadonlyData<TileState> | null {
		return this.tiles[pos.r_idx]?.[pos.q_idx] ?? null
	}

	contains(pos: BoardPosition): boolean {
		return (
			pos.r_idx >= 0 &&
			pos.r_idx < this.size &&
			pos.q_idx >= 0 &&
			pos.q_idx < (this.tiles[0]?.length ?? 0)
		)
	}

	key(pos: BoardPosition): PositionKey {
		return `${pos.q_idx},${pos.r_idx}`
	}

	neighborsOf(pos: BoardPosition): BoardPosition[] {
		const { q, r } = this.toHex(pos)
		const currentHex = new GameHex([q, r])
		const tempGrid = new Grid(GameHex, [currentHex])
		const neighbors: BoardPosition[] = []

		for (const dir of NEIGHBOR_DIRECTIONS) {
			const hex = tempGrid.neighborOf(currentHex, dir, { allowOutside: true })
			const candidate = this.fromHex(hex.q, hex.r)
			if (this.contains(candidate)) {
				neighbors.push(candidate)
			}
		}

		return neighbors
	}

	/**
	 * Compute the push destination for a knockback strike: the tile one hex
	 * step from `targetPos` in the direction `attackerPos → targetPos`. The
	 * destination is the neighbor of `targetPos` that maximizes the cube
	 * distance to `attackerPos`, breaking ties deterministically by direction
	 * order (E, NE, NW, W, SW, SE). The returned position may be off-board —
	 * callers must check {@link contains} before placing a unit there.
	 *
	 * Returns `null` when `attackerPos` and `targetPos` are the same tile, in
	 * which case there is no defined push direction.
	 */
	pushDestination(
		attackerPos: BoardPosition,
		targetPos: BoardPosition
	): BoardPosition | null {
		if (
			attackerPos.q_idx === targetPos.q_idx &&
			attackerPos.r_idx === targetPos.r_idx
		) {
			return null
		}

		const { q: tq, r: tr } = this.toHex(targetPos)
		const targetHex = new GameHex([tq, tr])
		const tempGrid = new Grid(GameHex, [targetHex])

		let bestPos: BoardPosition | null = null
		let bestDistance = -Infinity
		for (const dir of NEIGHBOR_DIRECTIONS) {
			const hex = tempGrid.neighborOf(targetHex, dir, { allowOutside: true })
			const candidate = this.fromHex(hex.q, hex.r)
			const distance = this.cubeDistance(attackerPos, candidate)
			if (distance > bestDistance) {
				bestPos = candidate
				bestDistance = distance
			}
		}

		return bestPos
	}

	distance(a: BoardPosition, b: BoardPosition): number {
		const aHex = this.toHex(a)
		const bHex = this.toHex(b)
		const grid = new Grid(GameHex, [
			new GameHex([aHex.q, aHex.r]),
			new GameHex([bHex.q, bHex.r])
		])
		return grid.distance([aHex.q, aHex.r], [bHex.q, bHex.r]) || 0
	}

	within(center: BoardPosition, range: number): BoardPosition[] {
		return positionsWithin(this.positions(), center, range)
	}

	update(pos: BoardPosition, updates: Partial<TileState>): Board {
		return new Board(updateTile(this.tiles, pos, updates), this.radius)
	}

	*positions(): IterableIterator<BoardPosition> {
		for (let r_idx = 0; r_idx < this.tiles.length; r_idx++) {
			const row = this.tiles[r_idx]
			if (!row) {
				continue
			}
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				if (row[q_idx]) {
					yield { q_idx, r_idx }
				}
			}
		}
	}

	*entries(): IterableIterator<[BoardPosition, ReadonlyData<TileState>]> {
		for (const pos of this.positions()) {
			const tile = this.at(pos)
			if (tile) {
				yield [pos, tile]
			}
		}
	}

	isAdjacentToBuilding(pos: BoardPosition): boolean {
		return this.neighborsOf(pos).some((n) => {
			const tile = this.at(n)
			return tile?.item !== null && tile?.item !== undefined
		})
	}

	/**
	 * For a position on a hex perimeter range, returns which of its 6 sides
	 * face outside the range (i.e. are actual perimeter edges).
	 * Sides: [E, NE, NW, W, SW, SE]. Off-board neighbours always count as
	 * perimeter and are placed at the slot for their direction — never at
	 * the tail — so renderers can index by side without correction.
	 */
	perimeterSides(
		pos: BoardPosition,
		rangeKeys: ReadonlySet<PositionKey>
	): boolean[] {
		const { q, r } = this.toHex(pos)
		const currentHex = new GameHex([q, r])
		const tempGrid = new Grid(GameHex, [currentHex])
		const sides: boolean[] = []
		for (const dir of NEIGHBOR_DIRECTIONS) {
			const hex = tempGrid.neighborOf(currentHex, dir, { allowOutside: true })
			const candidate = this.fromHex(hex.q, hex.r)
			if (!this.contains(candidate)) {
				sides.push(true)
				continue
			}
			sides.push(!rangeKeys.has(this.key(candidate)))
		}
		return sides
	}

	private toHex(pos: BoardPosition): HexCoordinate {
		const q = pos.q_idx - this.radius
		const r = pos.r_idx - this.radius
		return { q, r, s: -q - r }
	}

	private fromHex(q: number, r: number): BoardPosition {
		return { q_idx: q + this.radius, r_idx: r + this.radius }
	}

	/**
	 * Hex distance between two BoardPositions in pure cube space. Independent
	 * of board membership — safe to call on candidates that fall outside the
	 * grid (e.g. when computing knockback push destinations).
	 */
	cubeDistance(a: BoardPosition, b: BoardPosition): number {
		const ax = a.q_idx - this.radius
		const az = a.r_idx - this.radius
		const ay = -ax - az
		const bx = b.q_idx - this.radius
		const bz = b.r_idx - this.radius
		const by = -bx - bz
		return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2
	}
}

export function loadBoard(tiles: TileGrid): Board {
	return Board.from(tiles)
}

export interface BoardDimensions {
	width: number
	height: number
	radius: number
}

export function calculateBoardDimensions(
	boardSize: number,
	tileSize: number,
	spacing: number
): BoardDimensions {
	const radius = (boardSize - 1) / 2
	const hexWidth = Math.sqrt(3) * tileSize
	const hexHeight = 2 * tileSize
	const width = 2 * radius * Math.sqrt(3) * tileSize * spacing + hexWidth
	const height = 2 * radius * 1.5 * tileSize * spacing + hexHeight
	return { width, height, radius }
}

type MovementState = ReadonlyData<
	Pick<GameState, 'units' | 'playerStates' | 'currentPlayerTribe'>
>

/**
 * Build a {@link MovementContext} for the Unit at `source`. Owns every
 * derivation a reachability check needs: terrain gates from researched
 * Techs, the Frostlord -1 debuff, the per-Tech / per-Unit movement
 * budget, start-on-land vs water, and the flying flag. Bot lookahead and
 * UI rendering both score many target tiles against the same source —
 * call this once per source and reuse it for every candidate target via
 * {@link isReachable}.
 *
 * Returns `Err` only for source-side failures (no unit, unit cannot
 * move). Target-side checks live in {@link canMoveTo}.
 */
export function buildMovementContext(
	gameState: MovementState,
	source: BoardPosition
): Result.Result<MovementContext, GameActionError> {
	const board = Board.from(gameState.units.board)
	const { unitStates } = gameState.units
	const unitTile = board.at(source)
	if (!unitTile?.unit) {
		return Result.fail(
			new InvalidTargetError({ message: 'No unit at source position' })
		)
	}
	if (unitTile.unit.tribe !== gameState.currentPlayerTribe) {
		return Result.fail(
			new InvalidTargetError({
				message: 'Cannot move a unit you do not control'
			})
		)
	}
	const unitState = unitStates[unitTile.unit.id]
	if (!canUnitMove(unitState)) {
		return Result.fail(new UnitNotReadyError({ message: 'Unit cannot move' }))
	}

	const playerState = getPlayerState(
		gameState.playerStates,
		unitTile.unit.tribe
	)
	const researchedTechs = playerState?.researchedTechs ?? []
	const gates = terrainGatesFor(researchedTechs, unitTile.unit.type)
	const isFlying = unitTile.unit.stats.passive === 'flying'
	const isStartOnLand = !isWaterTerrain(unitTile.terrain)
	const maxMovement = movementBudget(board, gameState, unitTile, source)

	return Result.succeed({
		board,
		source,
		maxMovement,
		isFlying,
		isStartOnLand,
		gates
	})
}

/**
 * Single source of truth for movement legality. Both `executeMovement`
 * (authoritative dispatch path) and bot scorers call this — no consumer
 * re-derives rules, so preview and execution can't diverge.
 *
 * Covers: source unit presence, ready/cooldown state, target bounds,
 * self-move rejection, occupancy, and BFS reachability with terrain
 * restrictions, frostlord debuff, and tech passives (sprinter, road_and_seaports).
 *
 * Flying units (`stats.passive === 'flying'`) skip in-transit terrain gates
 * and walk the grid at flat 1 cost per tile, but the destination tile must
 * still satisfy the same stopping rules a ground unit would (mountain →
 * Climbing, shallow water → Water & Bomber, deep ocean → Ocean & Admiral).
 */
export function canMoveTo(
	gameState: MovementState,
	unitPos: BoardPosition,
	targetPos: BoardPosition
): Result.Result<void, GameActionError> {
	const ctxResult = buildMovementContext(gameState, unitPos)
	if (Result.isFailure(ctxResult)) {
		return Result.fail(ctxResult.failure)
	}
	const ctx = ctxResult.success

	const targetTile = ctx.board.at(targetPos)
	if (!targetTile) {
		return Result.fail(
			new InvalidTargetError({ message: 'Invalid target position' })
		)
	}

	if (unitPos.q_idx === targetPos.q_idx && unitPos.r_idx === targetPos.r_idx) {
		return Result.fail(
			new InvalidTargetError({ message: 'Cannot move to current position' })
		)
	}

	if (targetTile.unit) {
		return Result.fail(
			new InvalidTargetError({ message: 'Target position is occupied' })
		)
	}

	if (!ctx.isFlying && targetTile.obstacle !== null) {
		return Result.fail(
			new InvalidTargetError({
				message: 'Target tile is blocked by an obstacle'
			})
		)
	}

	// Stopping rule for flying units: the destination must satisfy the same
	// terrain gates as a ground unit. Transit is unrestricted (handled in
	// `isReachable`), but the unit can only land where it could legally stop.
	if (ctx.isFlying && !canStopOn(targetTile, ctx.gates)) {
		return Result.fail(
			new OutOfRangeError({
				message:
					'Flying unit cannot stop on that terrain without the matching tech'
			})
		)
	}

	if (isReachable(ctx, targetPos)) {
		return Result.succeed(undefined)
	}

	return Result.fail(
		new OutOfRangeError({ message: 'Target is out of movement range' })
	)
}

function movementBudget(
	board: Board,
	gameState: Pick<MovementState, 'playerStates'>,
	unitTile: TileState,
	unitPos: BoardPosition
): number {
	if (!unitTile.unit) {
		return 0
	}
	const unitStats = unitToUnitStats[unitTile.unit.type]
	const isStartOnLand = !isWaterTerrain(unitTile.terrain)
	const isFlying = unitTile.unit.stats.passive === 'flying'
	// Flying units pay 1-per-tile from the ground `movement` budget regardless
	// of whether they take off from land or water — they are not swimming.
	let maxMovement =
		isFlying || isStartOnLand ? unitStats.movement : unitStats.waterMovement

	// Frostlord "Frozen Ground" — adjacent enemies move -1
	const hasFrostlord = board.neighborsOf(unitPos).some((n) => {
		const tile = board.at(n)
		return (
			tile?.unit?.type === 'frostlord' &&
			tile.unit.tribe !== unitTile.unit?.tribe
		)
	})
	if (hasFrostlord) {
		maxMovement = Math.max(1, maxMovement - 1)
	}

	const playerState = getPlayerState(
		gameState.playerStates,
		unitTile.unit.tribe
	)
	const researchedTechs = playerState?.researchedTechs ?? []

	if (
		unitTile.unit.type === 'sprinter' &&
		hasTechPassive(researchedTechs, 'chivalry_bonus')
	) {
		maxMovement += 1
	}

	if (hasTechPassive(researchedTechs, 'mobility_movement')) {
		maxMovement += 1
	}

	if (hasTechPassive(researchedTechs, 'territory_movement')) {
		const tribeTerritory = tribeTerritoryKeys(board, unitTile.unit.tribe)
		if (tribeTerritory.has(board.key(unitPos))) {
			maxMovement += 1
		}
	}

	return maxMovement
}

/**
 * Resolve which restricted tiles a unit may step onto based on its tribe's
 * researched techs and unit type. Naval units always cross water and ocean;
 * `water_and_bomber` opens shallow water only; `ocean_and_admiral` (and the
 * `ocean_traversal` passive it carries) opens both. Climbing
 * (`mountain_traversal`) opens any `isMountain` tile regardless of its
 * underlying land terrain.
 */
function terrainGatesFor(
	researchedTechs: readonly Tech[],
	unitType: UnitType
): TerrainGates {
	const isNavalUnit = unitType === 'bombardier' || unitType === 'tidebreaker'
	const canEnterOcean =
		hasTechPassive(researchedTechs, 'ocean_traversal') || isNavalUnit
	const canEnterWater =
		canEnterOcean || hasTechPassive(researchedTechs, 'water_traversal')
	const canEnterMountain = hasTechPassive(researchedTechs, 'mountain_traversal')
	return { canEnterWater, canEnterOcean, canEnterMountain }
}

/**
 * Internal helper to avoid circular import with `domains/tribe`. Computes the
 * set of position keys covered by a tribe's village ranges, inlined so we
 * don't need to import `getTribeVillageRange` (which would cycle through the
 * board module for `within()`).
 */
function tribeTerritoryKeys(
	board: Board,
	tribe: Tribe
): ReadonlySet<PositionKey> {
	const keys = new Set<PositionKey>()
	for (const [pos, tile] of board.entries()) {
		if (tile.item?.type === 'village' && tile.item.tribe === tribe) {
			const villageRange = tile.item.range
			keys.add(board.key(pos))
			for (const inRange of board.within(pos, villageRange)) {
				keys.add(board.key(inRange))
			}
		}
	}
	return keys
}
