import { Result, Schema, type SchemaIssue } from 'effect'
import { type HexCoordinate } from '../board/position'
import { difficulties } from '../difficulty'
import { obstacleKinds } from '../domains/obstacle'
import { techs } from '../domains/tech'
import { tribes, type Tribe } from '../domains/tribe'
import { unitTypes } from '../domains/unit'
import { villageLevels, villagePerks } from '../domains/village'
import { type ReadonlyData } from '../type-utils'
import { type GameState } from '../game'
import {
	nonNegativeIntSchema,
	tileItemSchema
} from '../multiplayer/wire-schemas'
import { type TileState } from '../tile/tile'
import { terrains } from '../tile/tile-terrain'

/**
 * Sentinel for tiles hidden by fog of war. Carries position only — every
 * other field is null/`false` so the wire payload reveals nothing about the
 * underlying tile (terrain, items, units, obstacles).
 */
export type FogTile = {
	hex: HexCoordinate
	terrain: null
	item: null
	unit: null
	isMountain: false
	obstacle: null
}

/**
 * A tile in a {@link FilteredGameState} board. Either a full {@link TileState}
 * (the viewer can see it) or a {@link FogTile} (hidden by fog).
 *
 * Discriminate with `tile.terrain === null` — only `FogTile` has null
 * terrain; visible tiles always carry a real {@link TileTerrain}.
 */
export type FilteredTileState = TileState | FogTile

export type FilteredTileGrid = ReadonlyData<(FilteredTileState | null)[][]>

/**
 * Wire contract for tribe-scoped game state. Produced by `project()` and
 * validated against {@link validateFilteredGameState} before serialization.
 */
export type FilteredGameState = Omit<
	GameState,
	'seed' | 'playerStates' | 'units'
> & {
	units: Omit<GameState['units'], 'board'> & { board: FilteredTileGrid }
	playerStates: Partial<GameState['playerStates']>
}

const tribeSchema = Schema.Literals(tribes)
const difficultySchema = Schema.Literals(difficulties)
const techSchema = Schema.Literals(techs)
const terrainSchema = Schema.Literals(terrains)
const unitTypeSchema = Schema.Literals(unitTypes)
const boardPositionSchema = Schema.Struct({
	q_idx: Schema.Finite.pipe(Schema.check(Schema.isInt())),
	r_idx: Schema.Finite.pipe(Schema.check(Schema.isInt()))
})
const hexCoordinateSchema = Schema.Struct({
	q: Schema.Finite,
	r: Schema.Finite,
	s: Schema.Finite
})

const playerStateSchema = Schema.Struct({
	id: Schema.TemplateLiteral(['player_', Schema.String]),
	name: Schema.String,
	tribe: tribeSchema,
	money: Schema.Finite,
	exploration: Schema.Record(Schema.String, Schema.Literal(true)),
	researchedTechs: Schema.mutable(Schema.Array(techSchema)),
	researchInProgress: Schema.NullOr(
		Schema.Struct({
			tech: techSchema,
			turnsRemaining: nonNegativeIntSchema
		})
	),
	isBot: Schema.Boolean,
	difficulty: difficultySchema
})

const unitStatsSchema = Schema.Struct({
	health: Schema.Finite,
	attack: Schema.Finite,
	canAttackAfterMove: Schema.Boolean,
	canCaptureAfterMove: Schema.Boolean,
	defense: Schema.Finite,
	movement: Schema.Finite,
	waterMovement: Schema.Finite,
	range: Schema.Finite,
	waterRange: Schema.Finite,
	cost: Schema.Finite,
	air: Schema.Boolean,
	explorationRange: Schema.Finite,
	specialAttackAttribute: Schema.NullOr(
		Schema.Literals([
			'move',
			'attack',
			'heal',
			'aoe around',
			'aoe through',
			'push',
			'collect'
		])
	),
	requiredTech: Schema.NullOr(techSchema),
	passive: Schema.NullOr(
		Schema.Literals([
			'brace',
			'cleave',
			'splash',
			'tide_command',
			'knockback',
			'flying'
		])
	)
})

const unitSchema = Schema.Struct({
	id: Schema.TemplateLiteral(['unit_', Schema.String]),
	type: unitTypeSchema,
	stats: unitStatsSchema,
	tribe: tribeSchema
})

const obstacleKindSchema = Schema.Literals(obstacleKinds)

const visibleTileSchema = Schema.Struct({
	hex: hexCoordinateSchema,
	terrain: terrainSchema,
	item: Schema.NullOr(tileItemSchema),
	unit: Schema.NullOr(unitSchema),
	isMountain: Schema.Boolean,
	obstacle: Schema.NullOr(obstacleKindSchema)
})

// Fogged tiles carry no terrain, items, units, obstacles, or isMountain flag
// — every non-`hex` field is the null/`false` sentinel. Tribe-isolation
// validation relies on this shape; relaxing it would re-leak the data the
// projection just stripped.
const fogTileSchema = Schema.Struct({
	hex: hexCoordinateSchema,
	terrain: Schema.Null,
	item: Schema.Null,
	unit: Schema.Null,
	isMountain: Schema.Literal(false),
	obstacle: Schema.Null
})

const tileSchema = Schema.Union([visibleTileSchema, fogTileSchema])

const unitDebuffSchema = Schema.Union([
	Schema.Struct({
		type: Schema.Literal('hex_curse'),
		atkReduction: Schema.Finite,
		turnsRemaining: nonNegativeIntSchema
	}),
	Schema.Struct({
		type: Schema.Literal('morale_loss'),
		atkReduction: Schema.Finite,
		turnsRemaining: nonNegativeIntSchema
	})
])

const unitStateSchema = Schema.Struct({
	homeVillage: Schema.optionalKey(Schema.NullOr(boardPositionSchema)),
	mode: Schema.Literals(['ready', 'moved', 'retreat', 'acted']),
	health: Schema.Finite,
	level: nonNegativeIntSchema,
	kills: nonNegativeIntSchema,
	killsThisTurn: nonNegativeIntSchema,
	position: boardPositionSchema,
	debuffs: Schema.mutable(Schema.Array(unitDebuffSchema)),
	veterancyBonusAtk: Schema.Finite,
	veterancyBonusHp: Schema.Finite,
	hasBeenAttackedThisTurn: Schema.Boolean
})

export const filteredGameStateSchema = Schema.Struct({
	units: Schema.Struct({
		board: Schema.Array(Schema.Array(Schema.NullOr(tileSchema))),
		unitStates: Schema.Record(Schema.String, unitStateSchema)
	}),
	turn: Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
	),
	playerStates: Schema.Record(
		tribeSchema,
		Schema.optionalKey(playerStateSchema)
	),
	currentPlayerTribe: tribeSchema,
	eliminatedTribes: Schema.mutable(Schema.Array(tribeSchema)),
	isGameOver: Schema.Boolean,
	winner: Schema.NullOr(tribeSchema),
	nextUnitId: Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
	),
	pendingVillageLevelUps: Schema.Record(
		tribeSchema,
		Schema.optionalKey(
			Schema.Finite.pipe(
				Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
			)
		)
	),
	pendingPerkChoices: Schema.Record(
		tribeSchema,
		Schema.optionalKey(
			Schema.mutable(
				Schema.Array(
					Schema.Struct({
						villagePosition: boardPositionSchema,
						level: Schema.Literals(villageLevels),
						options: Schema.mutable(Schema.Array(Schema.Literals(villagePerks)))
					})
				)
			)
		)
	)
})

export type DecodedFilteredGameState = typeof filteredGameStateSchema.Type

export type FilteredGameStateIssue = {
	readonly path: readonly string[]
	readonly message: string
}

const decodeFiltered = Schema.decodeUnknownResult(filteredGameStateSchema)

/**
 * Structural + tribe-isolation validation of a projected `FilteredGameState`.
 *
 * The structural pass runs first (object shape, types). On success, a
 * second pass enforces that non-viewer tribes' `exploration` is empty and
 * `researchInProgress` is `null` — the rule that protects opponents from
 * leaking visibility through fog projection.
 */
export const validateFilteredGameState = (
	value: unknown,
	viewerTribe: Tribe
): Result.Result<DecodedFilteredGameState, FilteredGameStateIssue> => {
	const parsed = decodeFiltered(value)
	if (Result.isFailure(parsed)) {
		return Result.fail({
			path: extractPath(parsed.failure.issue),
			message: String(parsed.failure)
		})
	}
	const leak = findTribeIsolationLeak(parsed.success, viewerTribe)
	if (leak !== null) {
		return Result.fail(leak)
	}
	return Result.succeed(parsed.success)
}

const extractPath = (issue: SchemaIssue.Issue): readonly string[] => {
	const collected: string[] = []
	const visit = (node: SchemaIssue.Issue): void => {
		if (node._tag === 'Pointer') {
			for (const key of node.path) {
				collected.push(String(key))
			}
			visit(node.issue)
			return
		}
		if (node._tag === 'Filter' || node._tag === 'Encoding') {
			visit(node.issue)
			return
		}
		if (node._tag === 'Composite' || node._tag === 'AnyOf') {
			const first = node.issues[0]
			visit(first)
		}
	}
	visit(issue)
	return collected
}

/**
 * Cheap tribe-isolation check — O(tribes × 2 fields), no schema decode.
 *
 * Use this on hot paths where the structural shape is already trusted (the
 * wire codec has decoded the payload, the type system is `FilteredGameState`).
 * The full {@link validateFilteredGameState} is for untyped inputs.
 */
export const findTribeIsolationLeak = (
	state: { readonly playerStates: FilteredGameState['playerStates'] },
	viewerTribe: Tribe
): FilteredGameStateIssue | null => {
	for (const [tribe, player] of Object.entries(state.playerStates)) {
		if (tribe === viewerTribe) {
			continue
		}
		if (Object.keys(player.exploration).length > 0) {
			return {
				path: ['playerStates', tribe, 'exploration'],
				message: `Exploration for non-viewer tribe "${tribe}" must be empty`
			}
		}
		if (player.researchInProgress !== null) {
			return {
				path: ['playerStates', tribe, 'researchInProgress'],
				message: `researchInProgress for non-viewer tribe "${tribe}" must be null`
			}
		}
	}
	return null
}
