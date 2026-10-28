import { Schema } from 'effect'

export class InternalError extends Schema.TaggedError<InternalError>()(
	'InternalError',
	{
		traceId: Schema.String
	},
	{ httpApiStatus: 500 }
) {}

export class PlayerNotFoundError extends Schema.TaggedError<PlayerNotFoundError>()(
	'PlayerNotFoundError',
	{
		username: Schema.String
	},
	{ httpApiStatus: 404 }
) {}
