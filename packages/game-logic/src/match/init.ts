import { canFitPlayers, mapPlayerCapacity } from '../board/map-capacity'
import { Result, Schema } from 'effect'
import {
	generateBoard,
	type BoardGenerationParams
} from '../board/generate-board'
import { mapSettings } from '../board/starting-territories'
import { dailyDateFromUTC } from '../daily-challenge/seed'
import { tribeToTribeStats, type Tribe } from '../domains/tribe'
import { commitExploration, snapshotFor } from '../fog-of-war/snapshot'
import { type GameState } from '../game'
import { createGameWorld } from '../engine/world'
import { type MatchConfig } from '../multiplayer/types'
import { emptyChronicle } from './chronicle/chronicle'
import { createInitialPlayerStates } from '../player/player-state'
import { typedKeys } from '../type-utils'
import { type MatchState, type TurnSchedule } from './types'

export const MAP_SIZE_TO_TILES: Record<MatchConfig['mapSize'], number> = {
	small: 60,
	medium: 100,
	large: 180
}

export class MatchInitError extends Schema.TaggedError<MatchInitError>()(
	'MatchInitError',
	{ message: Schema.String }
) {}

/**
 * Build the initial {@link GameState} from a {@link MatchConfig}. This is the
 * single shared init path — both the server (`createInitialMatchState`) and
 * the offline `/game` route go through here. Anything that mutates board
 * generation, starting money, fog baseline, or unit-mode reset lives in one
 * place so online and offline match paths cannot drift.
 *
 * Returns a {@link Result.Result} parallel to `dispatch()` — `MatchInitError`
 * captures preconditions the caller couldn't verify upstream (currently:
 * empty player list, duplicate tribes, or overcrowded map).
 */
export function buildInitialGameState(
	config: MatchConfig
): Result.Result<GameState, MatchInitError> {
	const firstPlayer = config.players[0]
	if (!firstPlayer) {
		return Result.fail(
			new MatchInitError({ message: 'Match requires at least one player' })
		)
	}

	if (
		new Set(config.players.map((player) => player.tribe)).size !==
		config.players.length
	) {
		return Result.fail(
			new MatchInitError({ message: 'Match requires distinct player tribes' })
		)
	}

	if (!canFitPlayers(config.mapSize, config.players.length)) {
		return Result.fail(
			new MatchInitError({
				message: `${config.mapSize} maps support at most ${mapPlayerCapacity[config.mapSize]} players`
			})
		)
	}

	const numberOfTiles = MAP_SIZE_TO_TILES[config.mapSize]

	const generation: BoardGenerationParams = {
		numberOfTiles,
		numberOfVillages: Math.max(config.players.length * 3, 10),
		numberOfRuins: mapSettings(config.players.length).ruins.min,
		maximumRuins: mapSettings(config.players.length).ruins.max,
		numberOfPrimaryBuildings: 10,
		numberOfResources: 10,
		playerTribe: firstPlayer.tribe,
		numberOfOpponents: config.players.length - 1,
		gameTribes: config.players.map((p) => p.tribe)
	}
	if (config.seed !== undefined) {
		generation.seed = config.seed
	}
	const boardResult = generateBoard(generation)

	const playerStates = createInitialPlayerStates(
		config.players.map((p) => ({
			tribe: p.tribe,
			name: p.username,
			money: tribeToTribeStats[p.tribe].money,
			isBot: p.isBot,
			difficulty: p.botDifficulty
		}))
	)

	let gameState: GameState = {
		units: { board: boardResult.board, unitStates: boardResult.unitStates },
		turn: 1,
		playerStates,
		currentPlayerTribe: firstPlayer.tribe,
		eliminatedTribes: [],
		isGameOver: false,
		winner: null,
		nextUnitId: boardResult.nextUnitId,
		seed: boardResult.seed,
		pendingVillageLevelUps: {},
		pendingPerkChoices: {}
	}

	gameState = createGameWorld(gameState).snapshot()
	for (const tribe of typedKeys(gameState.playerStates)) {
		gameState = commitExploration(snapshotFor(gameState, tribe))
	}

	return Result.succeed(gameState)
}

/**
 * Build the initial MatchState for a match. Called once when the
 * Matchmaker initializes a new match via RPC. Propagates
 * {@link MatchInitError} from {@link buildInitialGameState}.
 */
export function createInitialMatchState(
	matchId: string,
	config: MatchConfig,
	now: number
): Result.Result<MatchState, MatchInitError> {
	const firstPlayer = config.players[0]
	if (!firstPlayer) {
		return Result.fail(
			new MatchInitError({ message: 'Match requires at least one player' })
		)
	}
	return Result.map(buildInitialGameState(config), (gameState) => {
		const playerIdToTribe: Record<string, Tribe> = {}
		for (const player of config.players) {
			playerIdToTribe[player.playerId] = player.tribe
		}

		// Turn 1 starts with config.players[0] (see currentPlayerTribe above), so
		// the first scheduled wake is gated on whether that player is a bot.
		let turnSchedule: TurnSchedule | null = null
		if (firstPlayer.isBot) {
			turnSchedule = { kind: 'bot', deadline: now }
		} else if (config.turnTimerSeconds) {
			turnSchedule = {
				kind: 'human',
				deadline: now + config.turnTimerSeconds * 1000
			}
		}

		return {
			matchId,
			gameState,
			config,
			startedAt: now,
			dailyDate: dailyDateFromUTC(new Date(now)),
			playerIdToTribe,
			turnSchedule,
			cleanupDeadline: null,
			disconnectedPlayers: {},
			connectionCount: 0,
			chronicle: emptyChronicle,
			forfeitedTribes: []
		}
	})
}
