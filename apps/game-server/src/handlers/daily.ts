import {
	HexwardensApi,
	InternalError,
	SessionContext,
	Unauthorized
} from '@hexwardens/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { todayDailyDate } from '@hexwardens/game-logic/daily-challenge/seed'
import { Daily } from '../daily'
import { capture } from '../observability'

const requireUser = Effect.gen(function* () {
	const session = yield* SessionContext
	if (session.isGuest) {
		return yield* new Unauthorized({
			message: 'Sign in to perform this action'
		})
	}
	return session
})

export const DailyHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'daily',
	(handlers) =>
		handlers
			.handle('view', ({ params }) =>
				capture(
					Effect.gen(function* () {
						const session = yield* SessionContext
						const daily = yield* Daily
						const user = session.isGuest
							? null
							: { id: session.userId, username: session.username }
						const view = yield* daily
							.view(params.date, user)
							.pipe(
								Effect.catchTag(['InvalidDailyDate'], () =>
									Effect.fail(new InternalError({ traceId: '' }))
								)
							)
						return {
							date: view.date,
							challenge: { ...view.challenge },
							entries: view.entries.map((entry) => ({ ...entry })),
							callerBest: view.callerBest ? { ...view.callerBest } : null,
							callerRank: view.callerRank,
							completionCount: view.completionCount,
							isAuthenticated: !session.isGuest
						}
					})
				)
			)
			.handle('streak', ({ query }) =>
				capture(
					Effect.gen(function* () {
						const user = yield* requireUser
						const today = query.date ?? todayDailyDate()
						const daily = yield* Daily
						const streak = yield* daily
							.currentStreak(user.userId, today)
							.pipe(
								Effect.catchTag(['InvalidDailyDate'], () =>
									Effect.fail(new InternalError({ traceId: '' }))
								)
							)
						return { streak }
					})
				)
			)
)
