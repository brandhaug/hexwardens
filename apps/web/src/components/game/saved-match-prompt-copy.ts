import { capitalize } from '@/lib/utils'
import { type SavedMatchMetadata } from '@hexwardens/game-logic/match/saved-match'

type SavedMatchPromptSummary = Pick<
	SavedMatchMetadata,
	'playerTribe' | 'turn' | 'mapSize' | 'opponentCount' | 'difficulty'
>

export function savedMatchPromptTitle(
	savedMatch: Pick<SavedMatchMetadata, 'playerTribe'>
): string {
	return `Continue ${capitalize(savedMatch.playerTribe)} Match`
}

export function savedMatchPromptSummary(
	savedMatch: SavedMatchPromptSummary
): string {
	const opponents =
		savedMatch.opponentCount === 1
			? '1 opponent'
			: `${savedMatch.opponentCount} opponents`
	return `Turn ${savedMatch.turn} · ${savedMatch.mapSize} board · ${opponents} · ${savedMatch.difficulty}`
}
