import { Schema } from 'effect'
import {
	assertBoardUnitStatesConsistency,
	BoardUnitInvariantError
} from '../board/unit-placement'
import { difficulties } from '../difficulty'
import { obstacleKinds } from '../domains/obstacle'
import { primaryBuildings } from '../domains/primary-building'
import { resources } from '../domains/resource'
import { secondaryBuildings } from '../domains/secondary-building'
import { techs } from '../domains/tech'
import { tribes } from '../domains/tribe'
import { unitTypes } from '../domains/unit'
import { utilityBuildings } from '../domains/utility-building'
import {
	villageKinds,
	villageLevels,
	villagePerks
} from '../domains/village-values'
import { type GameState } from '../game'
import { terrains } from '../tile/tile-terrain'

// Schemas are shared by every command workspace and constructed on first use.
function defineSchemas() {
	const nonNegativeInt = Schema.Finite.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
	)
	const tribe = Schema.Literals(tribes)
	const tech = Schema.Literals(techs)
	const owner = Schema.NullOr(tribe)
	const position = Schema.Struct({
		q_idx: nonNegativeInt,
		r_idx: nonNegativeInt
	})
	const perk = Schema.Literals(villagePerks)
	const level = Schema.Literals(villageLevels)
	const item = Schema.Union([
		Schema.Struct({
			type: Schema.Literal('primaryBuilding'),
			value: Schema.Literals(primaryBuildings),
			state: Schema.Literals(['idle', 'built']),
			tribe: owner
		}),
		Schema.Struct({
			type: Schema.Literal('secondaryBuilding'),
			value: Schema.Literals(secondaryBuildings),
			state: Schema.Literals(['built', 'large']),
			tribe: owner
		}),
		Schema.Struct({
			type: Schema.Literal('utilityBuilding'),
			value: Schema.Literals(utilityBuildings),
			state: Schema.Literal('built'),
			tribe: owner
		}),
		Schema.Struct({
			type: Schema.Literal('village'),
			state: Schema.Literals(['idle', 'built']),
			kind: Schema.Literals(villageKinds),
			level,
			tribe: owner,
			experience: Schema.Finite,
			experienceToNextLevel: Schema.Finite,
			perks: Schema.Array(perk),
			population: Schema.Finite,
			maxPopulation: Schema.Finite,
			range: Schema.Finite,
			salary: Schema.Finite,
			captureSetup: Schema.NullOr(
				Schema.Struct({ byTribe: tribe, turnInitiated: nonNegativeInt })
			)
		}),
		Schema.Struct({
			type: Schema.Literal('ruins'),
			reward: Schema.Literals(['money', 'experience', 'unit'])
		}),
		Schema.Struct({
			type: Schema.Literal('resource'),
			value: Schema.Literals(resources)
		})
	])
	const playerSchema = Schema.Struct({
		id: Schema.TemplateLiteral(['player_', Schema.String]),
		name: Schema.String,
		tribe,
		money: Schema.Finite,
		exploration: Schema.Record(Schema.String, Schema.Literal(true)),
		researchedTechs: Schema.mutable(Schema.Array(tech)),
		researchInProgress: Schema.NullOr(
			Schema.Struct({ tech, turnsRemaining: nonNegativeInt })
		),
		isBot: Schema.Boolean,
		difficulty: Schema.Literals(difficulties)
	})
	const unitSchema = Schema.Struct({
		id: Schema.TemplateLiteral(['unit_', Schema.String]),
		type: Schema.Literals(unitTypes),
		tribe,
		stats: Schema.Struct({
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
			requiredTech: Schema.NullOr(tech),
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
	})
	const unitStateSchema = Schema.Struct({
		homeVillage: Schema.optionalKey(Schema.NullOr(position)),
		mode: Schema.Literals(['ready', 'moved', 'retreat', 'acted']),
		health: Schema.Finite,
		level: nonNegativeInt,
		kills: nonNegativeInt,
		killsThisTurn: nonNegativeInt,
		position,
		debuffs: Schema.mutable(
			Schema.Array(
				Schema.Union([
					Schema.Struct({
						type: Schema.Literal('hex_curse'),
						atkReduction: Schema.Finite,
						turnsRemaining: nonNegativeInt
					}),
					Schema.Struct({
						type: Schema.Literal('morale_loss'),
						atkReduction: Schema.Finite,
						turnsRemaining: nonNegativeInt
					})
				])
			)
		),
		veterancyBonusAtk: Schema.Finite,
		veterancyBonusHp: Schema.Finite,
		hasBeenAttackedThisTurn: Schema.Boolean
	})
	const terrain = {
		hex: Schema.Struct({
			q: Schema.Finite,
			r: Schema.Finite,
			s: Schema.Finite
		}),
		terrain: Schema.Literals(terrains),
		item: Schema.NullOr(item),
		isMountain: Schema.Boolean,
		obstacle: Schema.NullOr(Schema.Literals(obstacleKinds))
	}
	const tileSchema = Schema.Struct({
		...terrain,
		unit: Schema.NullOr(unitSchema)
	})
	const unitComponentSchema = Schema.Struct({
		unit: unitSchema,
		state: unitStateSchema
	})
	const metadataSchema = Schema.Struct({
		turn: nonNegativeInt,
		currentPlayerTribe: tribe,
		eliminatedTribes: Schema.mutable(Schema.Array(tribe)),
		isGameOver: Schema.Boolean,
		winner: Schema.NullOr(tribe),
		nextUnitId: nonNegativeInt,
		seed: Schema.Finite,
		pendingVillageLevelUps: Schema.Record(
			tribe,
			Schema.optionalKey(nonNegativeInt)
		),
		pendingPerkChoices: Schema.Record(
			tribe,
			Schema.optionalKey(
				Schema.mutable(
					Schema.Array(
						Schema.Struct({
							villagePosition: position,
							level,
							options: Schema.mutable(Schema.Array(perk))
						})
					)
				)
			)
		)
	})
	const gameSnapshotSchema = Schema.Struct({
		...metadataSchema.fields,
		// Enum-keyed records reorder keys. Player insertion order is turn order;
		// check tribe keys relationally after the structural decode instead.
		playerStates: Schema.Record(Schema.String, playerSchema),
		units: Schema.Struct({
			board: Schema.Array(Schema.Array(Schema.NullOr(tileSchema))),
			unitStates: Schema.Record(Schema.String, unitStateSchema)
		})
	})
	return {
		gameSnapshotSchema,
		decodeTerrain: Schema.decodeUnknownSync(Schema.Struct(terrain)),
		decodePlayer: Schema.decodeUnknownSync(playerSchema),
		decodeUnit: Schema.decodeUnknownSync(unitComponentSchema),
		decodeMetadata: Schema.decodeUnknownSync(metadataSchema),
		decodeSnapshot: Schema.decodeUnknownSync(gameSnapshotSchema)
	}
}

let schemas: ReturnType<typeof defineSchemas> | undefined

export function getWorldSchemas(): ReturnType<typeof defineSchemas> {
	schemas ??= defineSchemas()
	return schemas
}

/** Decode persisted data and reject relational corruption before world creation. */
// This function is the persisted-data parser boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function decodeGameSnapshot(value: unknown): GameState {
	const state = getWorldSchemas().decodeSnapshot(value)
	assertBoardUnitStatesConsistency(state.units.board, state.units.unitStates)
	for (const [tribe, player] of Object.entries(state.playerStates)) {
		if (player.tribe !== tribe) {
			throw new BoardUnitInvariantError(
				`player key ${tribe} differs from tribe ${player.tribe}`
			)
		}
	}
	return state
}
