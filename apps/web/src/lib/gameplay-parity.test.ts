import { createHash } from 'node:crypto'
import { Result, Schema } from 'effect'
import { runBotTurn } from '@hexwardens/game-logic/bot/bot-turn'
import { GameHex } from '@hexwardens/game-logic/board/hex-utils'
import { snapshotFor } from '@hexwardens/game-logic/fog-of-war/snapshot'
import { type GameState } from '@hexwardens/game-logic/game'
import { buildInitialGameState } from '@hexwardens/game-logic/match/init'
import { allBotConfig } from '@hexwardens/game-logic/match/test-helpers'

const isJsonObject = Schema.is(Schema.JsonObject)

function canonical(value: Schema.Json): Schema.Json {
	if (Array.isArray(value)) {
		return value.map(canonical)
	}
	if (isJsonObject(value)) {
		return Object.fromEntries(
			Object.entries(value)
				.toSorted(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonical(entry)])
		)
	}
	return value
}

type GameplayProjection =
	| GameState
	| ReturnType<typeof snapshotFor>['projected']
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

function digest(value: GameplayProjection): string {
	return createHash('sha256')
		.update(JSON.stringify(canonical(decodeJson(JSON.stringify(value)))))
		.digest('hex')
}

function checkpoint(state: GameState) {
	return {
		turn: state.turn,
		tribe: state.currentPlayerTribe,
		winner: state.winner,
		state: digest(state),
		// Preserve the original own-property envelope without Result.toJSON.
		// oxlint-disable-next-line typescript/no-misused-spread
		barbarians: digest({ ...snapshotFor(state, 'barbarians').projected }),
		// oxlint-disable-next-line typescript/no-misused-spread
		rogues: digest({ ...snapshotFor(state, 'rogues').projected })
	}
}

// Captured before the ECS rewrite. These transcripts pin generation, bot choices,
// per-action state, turn phases and both viewers' fog projections across engines.
describe('fixed-seed gameplay compatibility', () => {
	it.each([7, 42, 2026])(
		'preserves the committed transcript for seed %i',
		async (seed) => {
			const initial = buildInitialGameState({ ...allBotConfig(), seed })
			assert(Result.isSuccess(initial))
			let state = initial.success
			const transcript = [checkpoint(state)]
			for (let turn = 0; turn < 8 && !state.isGameOver; turn++) {
				const tribe = state.currentPlayerTribe
				const player = state.playerStates[tribe]
				assert(player)
				const before = digest(state)
				const run = await runBotTurn(state, tribe, player.difficulty, GameHex)
				expect(run.error).toBeUndefined()
				expect(digest(state)).toBe(before)
				for (const intermediate of run.intermediateStates) {
					transcript.push(checkpoint(intermediate))
				}
				state = run.finalState
				transcript.push(checkpoint(state))
			}
			expect(transcript).toMatchSnapshot()
		},
		60_000
	)
})
