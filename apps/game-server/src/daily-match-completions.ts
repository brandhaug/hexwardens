import {
	DAILY_CHALLENGE_REGISTRY,
	type DailyChallengeId
} from '@hexwardens/game-logic/daily-challenge/registry'
import { dailyChallengeForDate } from '@hexwardens/game-logic/daily-challenge/rotation'
import {
	dailyDateFromUTC,
	isDailyDate,
	type DailyDate
} from '@hexwardens/game-logic/daily-challenge/seed'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import { type MatchResult } from './types'
import { type DailyCompletionInput } from './daily'

function dailyDateForMatch(
	state: MatchState,
	result: MatchResult
): DailyDate | null {
	if (isDailyDate(state.dailyDate)) {
		return state.dailyDate
	}
	if (Number.isFinite(state.startedAt)) {
		return dailyDateFromUTC(new Date(state.startedAt))
	}
	const completedDate = result.completedAt.slice(0, 10)
	return isDailyDate(completedDate) ? completedDate : null
}

export function dailyCompletionsForMatch(
	state: MatchState,
	result: MatchResult
): readonly DailyCompletionInput[] {
	if (state.config.kind !== 'publicQueue') {
		return []
	}

	const dailyDate = dailyDateForMatch(state, result)
	if (dailyDate === null) {
		return []
	}

	const challengeId: DailyChallengeId = dailyChallengeForDate(dailyDate)
	const challenge = DAILY_CHALLENGE_REGISTRY[challengeId]
	const forfeited = new Set(state.forfeitedTribes ?? [])
	const entries = state.chronicle?.entries ?? []
	const completions: DailyCompletionInput[] = []

	for (const player of result.players) {
		if (player.isBot) {
			continue
		}
		if (forfeited.has(player.tribe)) {
			continue
		}

		const progress = challenge.evaluate(entries, player.tribe)
		if (!progress.completed || progress.completedAtTurn === null) {
			continue
		}

		completions.push({
			userId: player.playerId,
			username: player.username,
			dailyDate,
			challengeId,
			turns: progress.completedAtTurn
		})
	}

	return completions
}
