import { Result } from 'effect'
import { type GameActionError } from './actions/action-errors'
import {
	applyDispatchEffects,
	dispatch,
	type DispatchSuccess,
	type Intent
} from './dispatch'
import { type Tribe } from './domains/tribe'
import { type GameState } from './game'

export type CommittedIntentSuccess = Omit<
	DispatchSuccess,
	'nextState' | 'effects'
> & {
	nextState: GameState
}

export function executeCommittedIntent(
	state: GameState,
	tribe: Tribe,
	intent: Intent
): Result.Result<CommittedIntentSuccess, GameActionError> {
	const result = dispatch(state, tribe, intent)
	if (Result.isFailure(result)) {
		return Result.fail(result.failure)
	}
	const { effects, nextState, ...rest } = result.success
	return Result.succeed({
		...rest,
		nextState: applyDispatchEffects(nextState, effects)
	})
}
