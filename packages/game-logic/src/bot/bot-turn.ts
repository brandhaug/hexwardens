import { Effect, Predicate, Result } from 'effect'
import { type Hex } from 'honeycomb-grid'
import Prando from 'prando'
import { type GameActionError } from '../actions/action-errors'
import { executeCommittedIntent } from '../action-execution'
import { type Difficulty } from '../difficulty'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { advanceTurn } from '../turns'
import { assertNever } from '../type-utils'
import { immediatePacer, type BotPacer } from './bot-pacer'
import { createBot } from './index'
import { personalities } from './personality'
import { type BotActionPlan } from './bot-types'

const DEFAULT_MAX_ACTIONS = 100
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3

function checkCancellation(signal: AbortSignal): void {
	if (signal.aborted) {
		throw signal.reason
	}
}

const pace = Effect.fn('Bot.pace')((pacer: BotPacer, signal: AbortSignal) =>
	Effect.promise(() => pacer.next(signal))
)

export interface BotTurnRun {
	finalState: GameState
	intermediateStates: GameState[]
	error?: { tribe: Tribe; turn: number; message: string }
}

export interface RunBotTurnOptions {
	/** Pacing between actions. Defaults to immediatePacer. */
	pacer?: BotPacer
	/** Cancellation rejects without advancing the turn. */
	signal?: AbortSignal
	/** Observes each successful action before turn advancement. */
	onStep?: (state: GameState) => void
	maxActions?: number
	maxConsecutiveFailures?: number
}

/** Seeded, bounded bot execution. The match host owns its lifetime and retries. */
export async function runBotTurn(
	gameState: GameState,
	tribe: Tribe,
	difficulty: Difficulty,
	gameHex: typeof Hex,
	opts: RunBotTurnOptions = {}
): Promise<BotTurnRun> {
	const pacer = opts.pacer ?? immediatePacer
	// Controllers cannot be constructed at module scope in Workers.
	const signal = opts.signal ?? new AbortController().signal
	const maxActions = opts.maxActions ?? DEFAULT_MAX_ACTIONS
	const maxConsecutiveFailures =
		opts.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES
	const rng = new Prando(`${gameState.seed}:${gameState.turn}:${tribe}`)
	const bot = createBot({
		personality: personalities[difficulty],
		rng: () => rng.next()
	})
	let currentState = gameState
	const intermediateStates: GameState[] = []
	let consecutiveFailures = 0
	let error: BotTurnRun['error']

	try {
		for (
			let attempt = 0;
			attempt < maxActions && consecutiveFailures < maxConsecutiveFailures;
			attempt++
		) {
			checkCancellation(signal)
			// oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- each action observes its predecessor and pacing boundary
			await Effect.runPromise(pace(pacer, signal), { signal })
			checkCancellation(signal)
			const action = bot.chooseAction(currentState, tribe, gameHex)
			if (!action) {
				break
			}
			const result = executeBotAction(
				currentState,
				action.execute(),
				tribe,
				gameHex
			)
			if (Result.isSuccess(result)) {
				currentState = result.success
				intermediateStates.push(currentState)
				consecutiveFailures = 0
				opts.onStep?.(currentState)
			} else {
				consecutiveFailures++
			}
		}
	} catch (cause) {
		if (signal.aborted) {
			throw signal.reason
		}
		// oxlint-disable-next-line hexwardens/no-unknown-error-message -- internal bot diagnostics are host telemetry
		const message = Predicate.isError(cause) ? cause.message : 'Bot turn failed'
		error = { tribe, turn: currentState.turn, message }
	}
	// Also covers an already-aborted zero-budget run or an abort in onStep.
	checkCancellation(signal)
	const run: BotTurnRun = {
		finalState: advanceTurn(currentState).state,
		intermediateStates
	}
	if (error) {
		run.error = error
	}
	return run
}

/** Execute one scored plan through the same committed action entry point as players. */
export function executeBotAction(
	gameState: GameState,
	plan: BotActionPlan,
	tribe: Tribe,
	_gameHex: typeof Hex
): Result.Result<GameState, GameActionError> {
	switch (plan.kind) {
		case 'move': {
			const result = executeCommittedIntent(gameState, tribe, {
				kind: 'move',
				from: plan.from,
				to: plan.to
			})
			return Result.map(result, (success) => success.nextState)
		}
		case 'attack': {
			const result = executeCommittedIntent(gameState, tribe, {
				kind: 'attack',
				from: plan.from,
				to: plan.target
			})
			return Result.map(result, (success) => success.nextState)
		}
		case 'tileAction': {
			const result = executeCommittedIntent(gameState, tribe, {
				kind: 'tileAction',
				action: plan.action
			})
			return Result.map(result, (success) => success.nextState)
		}
		default: {
			return assertNever(plan)
		}
	}
}
