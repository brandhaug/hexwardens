import { type Page } from '@playwright/test'
import { Result } from 'effect'
import { createInitialMatchState } from '@hexwardens/game-logic/match/init'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import {
	createSavedMatchRevision,
	SAVED_MATCH_GAME_LOGIC_VERSION
} from '@hexwardens/game-logic/match/saved-match'

export function createFixtureMatch(matchId: string): MatchState {
	const initial = createInitialMatchState(
		matchId,
		{
			mapSize: 'small',
			turnTimerSeconds: null,
			seed: 42,
			players: [
				{
					playerId: 'human',
					username: 'Player 1',
					tribe: 'barbarians',
					isBot: false,
					botDifficulty: 'Beginner'
				},
				{
					playerId: 'bot',
					username: 'Bot',
					tribe: 'rogues',
					isBot: true,
					botDifficulty: 'Beginner'
				}
			]
		},
		0
	)
	if (Result.isFailure(initial)) {
		throw new Error('Could not build saved match fixture')
	}
	return initial.success
}

export async function installSavedMatch(
	page: Page,
	matchState: MatchState
): Promise<void> {
	const record = createSavedMatchRevision({
		savedMatchId: matchState.matchId,
		playerTribe: 'barbarians',
		difficulty: 'Beginner',
		opponentCount: 1,
		updatedAt: new Date(0).toISOString(),
		gameLogicVersion: SAVED_MATCH_GAME_LOGIC_VERSION,
		matchState
	})
	await page.goto('/')
	await page.evaluate(async (saved) => {
		// IndexedDB's browser transaction callbacks are the persistence boundary.
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('hexwardens-saved-match', 1)
			request.addEventListener(
				'upgradeneeded',
				() => request.result.createObjectStore('saved-match'),
				{ once: true }
			)
			request.addEventListener(
				'error',
				() => reject(new Error('Could not open saved match fixture')),
				{ once: true }
			)
			request.addEventListener(
				'success',
				() => {
					const database = request.result
					const transaction = database.transaction('saved-match', 'readwrite')
					transaction.objectStore('saved-match').put(saved, 'active')
					transaction.addEventListener(
						'complete',
						() => {
							database.close()
							resolve()
						},
						{ once: true }
					)
					transaction.addEventListener(
						'error',
						() => {
							database.close()
							reject(new Error('Could not store draw fixture'))
						},
						{ once: true }
					)
				},
				{ once: true }
			)
		})
	}, record)
}
