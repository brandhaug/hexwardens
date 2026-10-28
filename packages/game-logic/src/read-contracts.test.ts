import { selectActionableUnits } from './player/actionable-units'
import { type ScoringFixture } from './bot/scoring-fixture'
import { Board, type buildMovementContext } from './board/board'
import { type GameState } from './game'
import {
	getPlayerState,
	getCurrentPlayerState,
	getActivePlayerStates
} from './player/player-state'
import { occupiedTileAt, occupiedTiles, tileAt } from './units/registry'
import { type TechPassiveDamageBonus } from './combat/modifiers/tech-bonuses'

// Compile-only failure cases. Never execute writes against real state.
function forbiddenReadWrites(state: GameState) {
	const player = getPlayerState(state.playerStates, state.currentPlayerTribe)
	if (player) {
		// @ts-expect-error Read helpers cannot bypass validated spending.
		player.money = -1
		// @ts-expect-error Research arrays belong to the player owner.
		player.researchedTechs.reverse()
		// @ts-expect-error Exploration cannot be changed through a read.
		player.exploration['0,0'] = true
		if (player.researchInProgress) {
			// @ts-expect-error Nested research progress is readonly.
			player.researchInProgress.turnsRemaining = 0
		}
	}
	// @ts-expect-error The required-player getter has the same read contract.
	getCurrentPlayerState(state.playerStates, state.currentPlayerTribe).money = -1
	for (const active of getActivePlayerStates(
		state.playerStates,
		state.eliminatedTribes
	)) {
		// @ts-expect-error Enumerated players are readonly too.
		active.researchedTechs.reverse()
	}
	const pos = { q_idx: 0, r_idx: 0 }
	const board = Board.from(state.units.board)
	const tile = board.at(pos)
	if (tile?.unit) {
		// @ts-expect-error Board reads cannot mutate shared unit stats.
		tile.unit.stats.health = 0
	}
	// @ts-expect-error Board rows cannot be replaced through the wrapper.
	board.tiles[0] = []
	for (const [, entry] of board.entries()) {
		// @ts-expect-error Iteration cannot mutate tiles.
		entry.terrain = 'grass'
	}
	const found = tileAt(state.units, pos)
	if (found) {
		// @ts-expect-error Registry tile reads cannot remove units independently.
		found.unit = null
	}
	const occupied = occupiedTileAt(state.units, pos)
	if (occupied) {
		// @ts-expect-error Unit read records cannot relocate units independently.
		occupied.state.position = pos
		// @ts-expect-error Nested debuff arrays are readonly.
		occupied.state.debuffs.pop()
	}
	for (const entry of occupiedTiles(state.units)) {
		// @ts-expect-error Enumeration cannot change health.
		entry.state.health = 0
	}
}

function movementRequirements(
	input: Parameters<typeof buildMovementContext>[0]
) {
	// @ts-expect-error Movement legality has no seed requirement.
	return input.seed
}

const bonus: TechPassiveDamageBonus = {
	passive: 'tracking',
	delta(state) {
		// @ts-expect-error Tech bonuses do not receive the authoritative game state.
		void state.gameState
		// @ts-expect-error Tech conditions cannot mutate combatants.
		state.attacker.stats.attack = 0
		return 0
	}
}

function forbiddenDerivedWrites(state: GameState, fixture: ScoringFixture) {
	const actionable = selectActionableUnits(state, state.currentPlayerTribe)[0]
	if (actionable) {
		// @ts-expect-error Actionable-unit reads cannot mutate shared stats.
		actionable.unit.stats.health = 0
	}
	const friendly = fixture.friendlyUnits[0]
	if (friendly) {
		// @ts-expect-error Cached scoring-unit state is readonly.
		friendly.state.health = 0
		// @ts-expect-error Cached scoring-unit stats are readonly.
		friendly.unit.stats.health = 0
		// @ts-expect-error Cached scoring tiles cannot remove units.
		friendly.tile.unit = null
	}
	const candidates = fixture.candidateTiles((_position, tile) => {
		// @ts-expect-error Tile filters cannot mutate the source board.
		tile.unit = null
		return true
	})
	for (const [, tile] of candidates) {
		// @ts-expect-error Candidate results retain the readonly tile view.
		tile.terrain = 'grass'
	}
	for (const enemy of fixture.enemiesWithin({ q_idx: 0, r_idx: 0 }, 1)) {
		// @ts-expect-error Enemy query results retain readonly nested arrays.
		enemy.state.debuffs.pop()
	}
}

it('keeps forbidden programs compile-only', () => {
	expect(forbiddenReadWrites).toBeTypeOf('function')
	expect(forbiddenDerivedWrites).toBeTypeOf('function')
	expect(movementRequirements).toBeTypeOf('function')
	expect(bonus.delta).toBeTypeOf('function')
})
