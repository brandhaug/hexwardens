import { Schema } from 'effect'

export class InvalidActionError extends Schema.TaggedError<InvalidActionError>()(
	'InvalidActionError',
	{ message: Schema.String }
) {}

export class InsufficientMoneyError extends Schema.TaggedError<InsufficientMoneyError>()(
	'InsufficientMoneyError',
	{ cost: Schema.Finite, message: Schema.String }
) {}

export class InvalidTargetError extends Schema.TaggedError<InvalidTargetError>()(
	'InvalidTargetError',
	{ message: Schema.String }
) {}

export class UnitNotReadyError extends Schema.TaggedError<UnitNotReadyError>()(
	'UnitNotReadyError',
	{ message: Schema.String }
) {}

export class PopulationFullError extends Schema.TaggedError<PopulationFullError>()(
	'PopulationFullError',
	{ message: Schema.String }
) {}

export class TechRequirementError extends Schema.TaggedError<TechRequirementError>()(
	'TechRequirementError',
	{ tech: Schema.String, message: Schema.String }
) {}

export class OutOfRangeError extends Schema.TaggedError<OutOfRangeError>()(
	'OutOfRangeError',
	{ message: Schema.String }
) {}

export class NotYourTurnError extends Schema.TaggedError<NotYourTurnError>()(
	'NotYourTurnError',
	{ message: Schema.String }
) {}

export class GameOverError extends Schema.TaggedError<GameOverError>()(
	'GameOverError',
	{ message: Schema.String }
) {}

export type GameActionError =
	| InvalidActionError
	| InsufficientMoneyError
	| InvalidTargetError
	| UnitNotReadyError
	| PopulationFullError
	| TechRequirementError
	| OutOfRangeError
	| NotYourTurnError
	| GameOverError
