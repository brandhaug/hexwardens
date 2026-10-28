import { Schema } from 'effect'
import { primaryBuildings } from '../domains/primary-building'
import { resources } from '../domains/resource'
import { secondaryBuildings } from '../domains/secondary-building'
import { tribes } from '../domains/tribe'
import { utilityBuildings } from '../domains/utility-building'
import { villageKinds, villageLevels, villagePerks } from '../domains/village'

export const tribeSchema = Schema.Literals(tribes)
export const villagePerkSchema = Schema.Literals(villagePerks)
export const resourceSchema = Schema.Literals(resources)
const primaryBuildingSchema = Schema.Literals(primaryBuildings)
const secondaryBuildingSchema = Schema.Literals(secondaryBuildings)
const utilityBuildingSchema = Schema.Literals(utilityBuildings)

export const nonNegativeIntSchema = Schema.Finite.pipe(
	Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
)

const tribeOwnerSchema = Schema.NullOr(tribeSchema)

export const tileItemSchema = Schema.Union([
	Schema.Struct({
		type: Schema.Literal('primaryBuilding'),
		value: primaryBuildingSchema,
		state: Schema.Literals(['idle', 'built']),
		tribe: tribeOwnerSchema
	}),
	Schema.Struct({
		type: Schema.Literal('secondaryBuilding'),
		value: secondaryBuildingSchema,
		state: Schema.Literals(['built', 'large']),
		tribe: tribeOwnerSchema
	}),
	Schema.Struct({
		type: Schema.Literal('utilityBuilding'),
		value: utilityBuildingSchema,
		state: Schema.Literal('built'),
		tribe: tribeOwnerSchema
	}),
	Schema.Struct({
		type: Schema.Literal('village'),
		state: Schema.Literals(['idle', 'built']),
		kind: Schema.Literals(villageKinds),
		level: Schema.Literals(villageLevels),
		tribe: tribeOwnerSchema,
		experience: Schema.Finite,
		experienceToNextLevel: Schema.Finite,
		perks: Schema.Array(villagePerkSchema),
		population: Schema.Finite,
		maxPopulation: Schema.Finite,
		range: Schema.Finite,
		salary: Schema.Finite,
		captureSetup: Schema.NullOr(
			Schema.Struct({
				byTribe: tribeSchema,
				turnInitiated: nonNegativeIntSchema
			})
		)
	}),
	Schema.Struct({
		type: Schema.Literal('ruins'),
		reward: Schema.Literals(['money', 'experience', 'unit'])
	}),
	Schema.Struct({
		type: Schema.Literal('resource'),
		value: resourceSchema
	})
])
