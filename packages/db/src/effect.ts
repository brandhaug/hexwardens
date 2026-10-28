import { Context, Effect, Layer, Schema } from 'effect'
import { createDb, type Database as DbClient } from './client.ts'

export class Database extends Context.Service<Database, DbClient>()(
	'@hexwardens/db/Database'
) {}

export const layerFromD1 = (d1: D1Database): Layer.Layer<Database> =>
	Layer.succeed(Database, createDb(d1))

export const layerFromClient = (db: DbClient): Layer.Layer<Database> =>
	Layer.succeed(Database, db)

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
	'DatabaseError',
	{
		operation: Schema.String,
		message: Schema.String,
		cause: Schema.optional(Schema.Defect())
	}
) {}

export const query = Effect.fnUntraced(
	function* <A>(
		operation: string,
		fn: (db: DbClient) => Promise<A>
	): Effect.fn.Return<A, DatabaseError, Database> {
		const db = yield* Database
		return yield* Effect.tryPromise({
			try: () => fn(db),
			catch: (cause) =>
				new DatabaseError({
					operation,
					message: 'Database operation failed',
					cause
				})
		})
	},
	(effect, operation) =>
		effect.pipe(
			Effect.withSpan(`db.${operation}`, {
				attributes: { 'db.system.name': 'd1', 'db.operation.name': operation }
			})
		)
)
