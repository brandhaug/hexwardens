import { assertNever } from '../type-utils'
import { type BoardPosition } from '../board/board'
import { getTechDisplayName } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { createActionPlanner } from './engine'
import { type ActionDenialReason, type ActionPlan } from './intent'

export interface InspectedAction {
	readonly label: string
	readonly plan: ActionPlan
	readonly explanation: string
}

/** Inspect relevant commands, including denied ones, without executing or revealing rewards. */
export function inspectTileActions(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition
): InspectedAction[] {
	if (state.isGameOver || state.currentPlayerTribe !== tribe) {
		return []
	}
	return createActionPlanner(state, tribe, at)
		.inspectActions()
		.map(({ candidate, plan }) => ({
			label: plan.kind === 'allowed' ? plan.preview.label : candidate.label,
			plan,
			explanation:
				plan.kind === 'allowed'
					? candidate.outcome
					: describeActionDenial(plan.reason)
		}))
}

export function describeActionDenial(reason: ActionDenialReason): string {
	switch (reason.kind) {
		case 'insufficientFunds': {
			return `Need ${reason.required} gold. You have ${reason.available}.`
		}
		case 'missingTech': {
			return `Research ${getTechDisplayName(reason.tech)} first.`
		}
		case 'researchInProgress': {
			return 'Research is already in progress.'
		}
		case 'invalidIntent':
		case 'invalidTarget':
		case 'noActionAvailable':
		case 'populationFull':
		case 'unitNotReady': {
			return reason.detail
		}
	}
	return assertNever(reason)
}
