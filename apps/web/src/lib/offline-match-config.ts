import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import {
	type Tribe,
	tribes as ALL_TRIBES
} from '@hexwardens/game-logic/domains/tribe'
import { type MatchConfig } from '@hexwardens/game-logic/multiplayer/types'
import { capitalize } from './utils'

type BuildOfflinePlayersArgs = {
	tribe: Tribe
	numberOfOpponents: number
	difficulty: Difficulty
	spectator: boolean
	playerName: string
}

/**
 * Build the `MatchConfig.players` list for the offline `/game` route. The
 * human (unless `spectator` is true) sits at slot 0 with their chosen tribe;
 * the remaining slots are filled with bots drawn from the other tribes.
 *
 * This is the UI-side bot-fill / spectator logic — it is not gameplay, so it
 * lives in `apps/web`. Gameplay invariants (starting money, fog baseline,
 * board generation) live behind `buildInitialGameState` in game-logic.
 */
export function buildOfflinePlayers({
	tribe,
	numberOfOpponents,
	difficulty,
	spectator,
	playerName
}: BuildOfflinePlayersArgs): MatchConfig['players'] {
	const botTribes = ALL_TRIBES.filter((t) => t !== tribe).slice(
		0,
		numberOfOpponents
	)
	const humanAsBot = spectator

	const humanSlot: MatchConfig['players'][number] = {
		playerId: humanAsBot ? 'offline_spectator' : 'offline_player_1',
		username: humanAsBot ? `${capitalize(tribe)} AI` : playerName,
		tribe,
		isBot: humanAsBot,
		botDifficulty: difficulty
	}

	const botSlots: MatchConfig['players'] = botTribes.map(
		(botTribe, index): MatchConfig['players'][number] => ({
			playerId: `offline_bot_${index + 1}`,
			username: `${capitalize(botTribe)} AI`,
			tribe: botTribe,
			isBot: true,
			botDifficulty: difficulty
		})
	)

	return [humanSlot, ...botSlots]
}
