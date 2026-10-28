import { Grid } from 'honeycomb-grid'
import { GameHex, NEIGHBOR_DIRECTIONS } from './hex-utils'
import { type Board } from './board'
import { type BoardPosition } from './position'
import { isWaterTerrain, type TileTerrain } from '../tile/tile-terrain'

/**
 * Terrain unlocks a Unit's Tribe has researched, normalised across naval Unit
 * types so the search doesn't have to special-case each Unit kind. `canEnterMountain`
 * gates entry to any tile flagged `isMountain`, regardless of the underlying
 * land terrain (stone, grass, forest, ...).
 */
export interface TerrainGates {
	readonly canEnterWater: boolean
	readonly canEnterOcean: boolean
	readonly canEnterMountain: boolean
}

/**
 * Per-move computation context. Built once from `(GameState, source)`
 * — every legal-move check the caller wants to make against a fixed
 * source position reuses this rather than re-deriving terrain gates,
 * movement budget, and start-on-land. Bot lookahead and UI rendering
 * both score many targets against the same source; that's the seam.
 */
export interface MovementContext {
	readonly board: Board
	readonly source: BoardPosition
	readonly maxMovement: number
	readonly isFlying: boolean
	readonly isStartOnLand: boolean
	readonly gates: TerrainGates
}

/**
 * Can a Unit with the given `gates` legally end its move on the given
 * tile? Shared by the search (where flying transit is unrestricted but the
 * destination must still respect stopping rules) and by `canMoveTo` (which
 * short-circuits before search for flying units onto gated terrain).
 *
 * Mountains gate first — an `isMountain` tile blocks regardless of the
 * underlying land terrain — then ocean / shallow water gates.
 */
export function canStopOn(
	tile: { readonly terrain: TileTerrain; readonly isMountain: boolean },
	gates: TerrainGates
): boolean {
	if (tile.isMountain && !gates.canEnterMountain) {
		return false
	}
	if (tile.terrain === 'ocean') {
		return gates.canEnterOcean
	}
	if (isWaterTerrain(tile.terrain)) {
		return gates.canEnterWater
	}
	return true
}

interface MovementStep {
	readonly q: number
	readonly r: number
	readonly distance: number
	readonly consecutiveWaterTiles: number
	readonly consecutiveLandTiles: number
	readonly lastTerrainWasWater: boolean
	readonly hasSwitchedTerrain: boolean
}

// Axial (q, r) deltas in the same order as NEIGHBOR_DIRECTIONS. Materialized
// once by asking honeycomb-grid for the offsets so the search never allocates a
// Hex or Grid per dequeue.
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = (() => {
	const origin = new GameHex([0, 0])
	const grid = new Grid(GameHex, [origin])
	return NEIGHBOR_DIRECTIONS.map((dir) => {
		const n = grid.neighborOf(origin, dir, { allowOutside: true })
		return [n.q - origin.q, n.r - origin.r] as const
	})
})()

/**
 * One step in the search frontier: given the current `from` state and the
 * neighbouring `tile`, decide whether the Unit can transit into it under
 * its gates / flying rules, and produce the successor search state, or `null`
 * if entry is rejected.
 *
 * Ground rules — pulled out into one place so the search body stays narrative:
 *
 * - Ocean / shallow-water / mountain / obstacle gates block entry.
 * - "Consecutive water" cap: a unit that started on land can spend at most
 *   one transit tile in water before needing to step back onto land.
 *   Symmetric rule for water-start units crossing land.
 * - "Single terrain switch": once a unit toggles from land→water or vice
 *   versa, it cannot toggle a second time on the same move.
 *
 * Flying units skip all of the above and pay 1 movement per tile (the
 * mountain `cost = 2` penalty also doesn't apply).
 */
function stepInto(
	ctx: MovementContext,
	from: MovementStep,
	tile: {
		readonly terrain: TileTerrain
		readonly isMountain: boolean
		readonly obstacle: unknown
	},
	neighborQ: number,
	neighborR: number
): MovementStep | null {
	const isOcean = tile.terrain === 'ocean'
	const isWater = isWaterTerrain(tile.terrain)
	const isMountain = tile.isMountain
	const isLand = !isWater

	if (!ctx.isFlying) {
		if (isOcean && !ctx.gates.canEnterOcean) {
			return null
		}
		if (ctx.isStartOnLand && isWater && !ctx.gates.canEnterWater) {
			return null
		}
		if (isMountain && !ctx.gates.canEnterMountain) {
			return null
		}
		if (tile.obstacle !== null) {
			return null
		}
	}

	const newConsecutiveWater = isWater ? from.consecutiveWaterTiles + 1 : 0
	const newConsecutiveLand = isLand ? from.consecutiveLandTiles + 1 : 0

	const switching = isWater !== from.lastTerrainWasWater
	const newHasSwitched = from.hasSwitchedTerrain || switching

	if (!ctx.isFlying) {
		if (ctx.isStartOnLand && newConsecutiveWater >= 2) {
			return null
		}
		if (!ctx.isStartOnLand && newConsecutiveLand >= 2) {
			return null
		}
		if (from.hasSwitchedTerrain && switching) {
			return null
		}
	}

	const cost = !ctx.isFlying && isMountain ? 2 : 1

	return {
		q: neighborQ,
		r: neighborR,
		distance: from.distance + cost,
		consecutiveWaterTiles: newConsecutiveWater,
		consecutiveLandTiles: newConsecutiveLand,
		lastTerrainWasWater: isWater,
		hasSwitchedTerrain: newHasSwitched
	}
}

/**
 * Movement reachability: can a Unit positioned at `ctx.source` reach
 * `target` within its `maxMovement` budget, respecting terrain gates,
 * obstacles, water-crossing limits, and the flying exception? Pure least-cost search;
 * does not read `GameState`. Tile contents come from `ctx.board.tiles`.
 *
 * Stopping rules for the destination are the caller's concern — for ground
 * units `canMoveTo` rejects occupied tiles and out-of-bounds targets before
 * search; for flying units it additionally checks `canStopOn(terrain, gates)`.
 */
export function isReachable(
	ctx: MovementContext,
	target: BoardPosition
): boolean {
	const radius = ctx.board.radius
	const size = ctx.board.size
	const targetQ = target.q_idx - radius
	const targetR = target.r_idx - radius

	const start: MovementStep = {
		q: ctx.source.q_idx - radius,
		r: ctx.source.r_idx - radius,
		distance: 0,
		consecutiveWaterTiles: 0,
		consecutiveLandTiles: 0,
		lastTerrainWasWater: !ctx.isStartOnLand,
		hasSwitchedTerrain: false
	}
	const queue: MovementStep[] = [start]
	const bestCost = new Map<string, number>()

	while (queue.length > 0) {
		queue.sort((a, b) => a.distance - b.distance)
		const current = queue.shift()
		if (!current) {
			continue
		}

		// Crossing history affects which continuations are legal. A position alone
		// cannot identify a search state, and a costlier visit must not win.
		const currentKey = `${current.q},${current.r},${current.consecutiveWaterTiles},${current.consecutiveLandTiles},${current.lastTerrainWasWater},${current.hasSwitchedTerrain}`
		if (
			(bestCost.get(currentKey) ?? Infinity) <= current.distance ||
			current.distance > ctx.maxMovement
		) {
			continue
		}
		bestCost.set(currentKey, current.distance)

		if (current.q === targetQ && current.r === targetR) {
			return true
		}

		for (const [dq, dr] of NEIGHBOR_OFFSETS) {
			const nq = current.q + dq
			const nr: number = current.r + dr
			const neighborQ = nq + radius
			const neighborR = nr + radius
			if (
				neighborR < 0 ||
				neighborR >= size ||
				neighborQ < 0 ||
				neighborQ >= size
			) {
				continue
			}
			const tile = ctx.board.tiles[neighborR]?.[neighborQ]
			if (!tile) {
				continue
			}

			const candidate = stepInto(ctx, current, tile, nq, nr)
			if (candidate !== null) {
				queue.push(candidate)
			}
		}
	}
	return false
}
