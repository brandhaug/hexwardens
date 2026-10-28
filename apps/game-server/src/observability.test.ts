import { it } from '@effect/vitest'
import { type Cause, Effect, Layer, Ref, Schema } from 'effect'
import { DatabaseError } from '@hexwardens/db/effect'
import { ErrorCapture, InternalError, capture } from './observability'

const makeRecorder = (traceId: string) =>
	Effect.gen(function* () {
		const seen = yield* Ref.make<ReadonlyArray<Cause.Cause<unknown>>>([])
		const layer = Layer.succeed(ErrorCapture, {
			captureException: (cause) =>
				Ref.update(seen, (prev) => [...prev, cause]).pipe(Effect.as(traceId))
		})
		return { layer, seen }
	})

describe('capture', () => {
	it.effect(
		'translates DatabaseError to InternalError with ErrorCapture trace id',
		() =>
			Effect.gen(function* () {
				const { layer, seen } = yield* makeRecorder('trace-abc')
				const err = new DatabaseError({
					operation: 'leaderboard.list',
					message: 'db down'
				})

				const result = yield* Effect.flip(capture(Effect.fail(err))).pipe(
					Effect.provide(layer)
				)

				expect(result).toBeInstanceOf(InternalError)
				expect(result.traceId).toBe('trace-abc')

				const causes = yield* Ref.get(seen)
				expect(causes).toHaveLength(1)
			})
	)

	it.effect('uses empty traceId when no ErrorCapture is wired', () =>
		Effect.gen(function* () {
			const err = new DatabaseError({
				operation: 'leaderboard.list',
				message: 'db down'
			})

			const result = yield* Effect.flip(capture(Effect.fail(err)))

			expect(result).toBeInstanceOf(InternalError)
			expect(result.traceId).toBe('')
		})
	)

	it.effect(
		'passes typed errors other than DatabaseError through unchanged',
		() =>
			Effect.gen(function* () {
				class DomainError extends Schema.TaggedError<DomainError>()(
					'DomainError',
					{ message: Schema.String }
				) {}

				const err = new DomainError({ message: 'forbidden' })
				const result = yield* Effect.flip(
					capture(Effect.fail<DomainError>(err))
				)

				expect(result).toBe(err)
				expect(result).toBeInstanceOf(DomainError)
			})
	)

	it.effect('returns success values unchanged', () =>
		Effect.gen(function* () {
			const value = yield* capture(Effect.succeed(42))
			expect(value).toBe(42)
		})
	)
})
