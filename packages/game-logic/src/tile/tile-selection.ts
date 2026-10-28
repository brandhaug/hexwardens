import { positionKey, type BoardPosition } from '../board/board'
import { type Tribe } from '../domains/tribe'
import { snapshotFor } from '../fog-of-war/snapshot'
import { type GameState } from '../game'

export function handleTileSelection(
	clickedPosition: BoardPosition,
	currentSelection: BoardPosition | null,
	gameState: GameState,
	currentPlayerTribe: Tribe
): BoardPosition | null {
	const clickedTile =
		gameState.units.board[clickedPosition.r_idx]?.[clickedPosition.q_idx]

	if (!clickedTile) {
		return null
	}

	if (
		currentSelection &&
		currentSelection.q_idx === clickedPosition.q_idx &&
		currentSelection.r_idx === clickedPosition.r_idx
	) {
		return null
	}

	// Fog-of-war guard: allow selection of any tile the player has currently
	// in sight OR has previously explored. Tiles that have never been seen
	// stay unselectable — they render as fog clouds and have no data to show.
	const key = positionKey(clickedPosition)
	const isVisible = snapshotFor(
		gameState,
		currentPlayerTribe
	).visibleTileIds.has(key)
	const isExplored =
		gameState.playerStates[currentPlayerTribe]?.exploration[key] === true
	if (!isVisible && !isExplored) {
		return currentSelection
	}

	return clickedPosition
}
