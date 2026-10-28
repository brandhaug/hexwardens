import { InternalError } from '@hexwardens/api'
import { Cause, Context, Effect, Option, Schema } from 'effect'
import { DatabaseError } from '@hexwardens/db/effect'

export { InternalError }

export interface ErrorCaptureService {
	readonly captureException: (
		cause: Cause.Cause<unknown>
	) => Effect.Effect<string>
}

export class ErrorCapture extends Context.Service<
	ErrorCapture,
	ErrorCaptureService
>()('@hexwardens/game-server/ErrorCapture') {}

const noOp: ErrorCaptureService = { captureException: () => Effect.succeed('') }

const resolveCapture: Effect.Effect<ErrorCaptureService> = Effect.serviceOption(
	ErrorCapture
).pipe(Effect.map((opt) => (Option.isSome(opt) ? opt.value : noOp)))

const captureDatabaseError = (
	error: DatabaseError
): Effect.Effect<never, InternalError> =>
	resolveCapture.pipe(
		Effect.flatMap((capture) => capture.captureException(Cause.fail(error))),
		Effect.flatMap((traceId) => Effect.fail(new InternalError({ traceId })))
	)

export const capture = <A, E, R>(
	effect: Effect.Effect<A, E | DatabaseError, R>
) => Effect.catchIf(effect, Schema.is(DatabaseError), captureDatabaseError)
