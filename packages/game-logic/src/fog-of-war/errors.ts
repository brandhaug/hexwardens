import { Schema } from 'effect'

export class ViewerTribeMissingError extends Schema.TaggedError<ViewerTribeMissingError>()(
	'ViewerTribeMissingError',
	{ tribe: Schema.String, message: Schema.String }
) {}

export class SchemaViolationError extends Schema.TaggedError<SchemaViolationError>()(
	'SchemaViolationError',
	{
		tribe: Schema.String,
		path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
		message: Schema.String
	}
) {}

export type FogProjectionError = ViewerTribeMissingError | SchemaViolationError
