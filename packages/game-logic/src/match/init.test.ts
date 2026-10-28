import { requireTestValue } from '../test/game-test-helpers'
import { Result } from 'effect'
import { tribes, tribeToTribeStats } from '../domains/tribe'
import { type GameState } from '../game'
import { type MatchConfig, type MatchPlayer } from '../multiplayer/types'
import { typedKeys } from '../type-utils'
import {
	buildInitialGameState,
	MatchInitError,
	MAP_SIZE_TO_TILES
} from './init'

function buildOrThrow(config: MatchConfig): GameState {
	return Result.getOrThrow(buildInitialGameState(config))
}

function makePlayer(overrides: Partial<MatchPlayer> = {}): MatchPlayer {
	return {
		playerId: 'p1',
		username: 'Alice',
		tribe: 'barbarians',
		isBot: false,
		botDifficulty: 'Beginner',
		...overrides
	}
}

function humanVsBotConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
	return {
		mapSize: 'small',
		turnTimerSeconds: null,
		players: [
			makePlayer({ playerId: 'p1', username: 'Alice', tribe: 'barbarians' }),
			makePlayer({
				playerId: 'bot-1',
				username: 'Rogues Bot',
				tribe: 'rogues',
				isBot: true,
				botDifficulty: 'Expert'
			})
		],
		...overrides
	}
}

describe('buildInitialGameState', () => {
	it('creates a PlayerState per config tribe with tribe-specific starting money', () => {
		const config = humanVsBotConfig({
			players: [
				makePlayer({ playerId: 'p1', tribe: 'barbarians' }),
				makePlayer({ playerId: 'p2', tribe: 'rogues' }),
				makePlayer({ playerId: 'p3', tribe: 'orcs', isBot: true })
			]
		})
		const state = buildOrThrow(config)

		expect(typedKeys(state.playerStates).toSorted()).toEqual(
			['orcs', 'rogues', 'barbarians'].toSorted()
		)
		for (const tribe of typedKeys(state.playerStates)) {
			const player = requireTestValue(state.playerStates[tribe])
			expect(player.money).toBe(tribeToTribeStats[tribe].money)
		}
	})

	it('commits starting exploration for every configured tribe', () => {
		const config = humanVsBotConfig({ seed: 42 })
		const state = buildOrThrow(config)
		for (const player of config.players) {
			expect(
				Object.keys(state.playerStates[player.tribe]?.exploration ?? {}).length
			).toBeGreaterThan(0)
		}
	})

	it('rejects duplicate tribes before board generation', () => {
		const result = buildInitialGameState(
			humanVsBotConfig({
				players: [makePlayer(), makePlayer({ playerId: 'p2' })]
			})
		)
		assert(Result.isFailure(result))
		expect(result.failure.message).toBe('Match requires distinct player tribes')
	})

	it('includes the recovered two-player ruins count in normal matches', () => {
		const state = buildOrThrow(humanVsBotConfig({ seed: 42 }))
		const count = state.units.board
			.flat()
			.filter((tile) => tile?.item?.type === 'ruins').length
		expect(count).toBeGreaterThanOrEqual(2)
		expect(count).toBeLessThanOrEqual(3)
	})

	it('resets every unit mode to "ready" after fog commit', () => {
		const config = humanVsBotConfig()
		const state = buildOrThrow(config)

		const unitStates = state.units.unitStates
		const modes = Object.values(unitStates).map((u) => u.mode)
		expect(modes.length).toBeGreaterThan(0)
		for (const mode of modes) {
			expect(mode).toBe('ready')
		}
	})

	it('propagates isBot and botDifficulty onto PlayerState', () => {
		const config = humanVsBotConfig({
			players: [
				makePlayer({
					playerId: 'p1',
					tribe: 'barbarians',
					isBot: false,
					botDifficulty: 'Beginner'
				}),
				makePlayer({
					playerId: 'bot-1',
					tribe: 'rogues',
					isBot: true,
					botDifficulty: 'Legend'
				})
			]
		})
		const state = buildOrThrow(config)

		expect(state.playerStates.barbarians?.isBot).toBe(false)
		expect(state.playerStates.barbarians?.difficulty).toBe('Beginner')
		expect(state.playerStates.rogues?.isBot).toBe(true)
		expect(state.playerStates.rogues?.difficulty).toBe('Legend')
	})

	it('handles an all-bot spectator composition with no human player', () => {
		const config: MatchConfig = {
			mapSize: 'small',
			turnTimerSeconds: null,
			players: [
				makePlayer({
					playerId: 'bot-1',
					username: 'Barbarians AI',
					tribe: 'barbarians',
					isBot: true,
					botDifficulty: 'Beginner'
				}),
				makePlayer({
					playerId: 'bot-2',
					username: 'Rogues AI',
					tribe: 'rogues',
					isBot: true,
					botDifficulty: 'Advanced'
				})
			]
		}
		const state = buildOrThrow(config)

		expect(state.currentPlayerTribe).toBe('barbarians')
		expect(state.isGameOver).toBe(false)
		expect(state.winner).toBeNull()
		for (const tribe of typedKeys(state.playerStates)) {
			expect(requireTestValue(state.playerStates[tribe]).isBot).toBe(true)
		}
	})

	it('mapSize determines board dimensions per the MAP_SIZE_TO_TILES table', () => {
		const makeConfig = (mapSize: MatchConfig['mapSize']): MatchConfig => ({
			mapSize,
			turnTimerSeconds: null,
			players: [
				makePlayer({ playerId: 'p1', tribe: 'barbarians' }),
				makePlayer({ playerId: 'p2', tribe: 'rogues', isBot: true })
			]
		})

		const small = buildOrThrow(makeConfig('small'))
		const medium = buildOrThrow(makeConfig('medium'))
		const large = buildOrThrow(makeConfig('large'))

		// Board is square (boardSize x boardSize). Bigger mapSize → bigger board.
		expect(small.units.board.length).toBeLessThan(medium.units.board.length)
		expect(medium.units.board.length).toBeLessThan(large.units.board.length)

		// Sanity-check that the lookup table itself is monotonic — the hard
		// contract consumed by the server's `snapshotToMatchConfig → init` path.
		expect(MAP_SIZE_TO_TILES.small).toBeLessThan(MAP_SIZE_TO_TILES.medium)
		expect(MAP_SIZE_TO_TILES.medium).toBeLessThan(MAP_SIZE_TO_TILES.large)
	})

	it('returns a MatchInitError failure when the config has no players', () => {
		const result = buildInitialGameState({
			mapSize: 'small',
			turnTimerSeconds: null,
			players: []
		})
		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure).toBeInstanceOf(MatchInitError)
		expect(result.failure.message).toBe('Match requires at least one player')
	})

	it("marks each tribe's starting village as the Capital with +1 maxPopulation", () => {
		const config = humanVsBotConfig()
		const state = buildOrThrow(config)

		const firstTribe = config.players[0]?.tribe
		expect(firstTribe).toBeDefined()
		assert(firstTribe)

		const capitalsByTribe: Record<string, number> = {}
		for (const row of state.units.board) {
			for (const tile of row) {
				if (tile?.item?.type !== 'village') {
					continue
				}
				if (tile.item.kind !== 'capital') {
					continue
				}
				const owner = tile.item.tribe
				if (owner === null) {
					continue
				}
				capitalsByTribe[owner] = (capitalsByTribe[owner] ?? 0) + 1
				// Capital level-1 base maxPopulation is 2; capital adds +1 = 3.
				expect(tile.item.maxPopulation).toBe(3)
			}
		}

		// At least the first config tribe is guaranteed to have a capital
		// (see opponent-tribe-drift carve-out above).
		expect(capitalsByTribe[firstTribe]).toBe(1)
	})

	it('keeps non-starting (neutral) villages as regular kind', () => {
		const config = humanVsBotConfig()
		const state = buildOrThrow(config)

		// Neutral villages are placed without a tribe before the tribe
		// units are seeded, so any village with `tribe === null` should
		// remain a regular village.
		for (const row of state.units.board) {
			for (const tile of row) {
				if (tile?.item?.type !== 'village') {
					continue
				}
				expect(tile.item.tribe !== null || tile.item.kind === 'regular').toBe(
					true
				)
			}
		}
	})

	it('starts turn 1 with config.players[0] as the current tribe', () => {
		const config = humanVsBotConfig({
			players: [
				makePlayer({ playerId: 'p1', tribe: 'orcs' }),
				makePlayer({ playerId: 'p2', tribe: 'templars', isBot: true })
			]
		})
		const state = buildOrThrow(config)

		expect(state.turn).toBe(1)
		expect(state.currentPlayerTribe).toBe('orcs')
		expect(state.eliminatedTribes).toEqual([])
	})
})

it.each([
	{ mapSize: 'small', count: 4 },
	{ mapSize: 'medium', count: 5 },
	{ mapSize: 'large', count: 6 }
])('rejects $count players on a $mapSize map', ({ mapSize, count }) => {
	if (mapSize !== 'small' && mapSize !== 'medium' && mapSize !== 'large') {
		throw new Error('invalid test map')
	}
	const result = buildInitialGameState(
		humanVsBotConfig({
			mapSize,
			players: tribes
				.slice(0, count)
				.map((tribe, index) => makePlayer({ tribe, playerId: `p${index}` }))
		})
	)
	expect(Result.isFailure(result)).toBe(true)
})
