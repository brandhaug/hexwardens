import { type BoardPosition } from '../../board/board'
import { type CombatEvent } from '../../combat/types'
import { type Tribe } from '../../domains/tribe'
import { type Unit } from '../../domains/unit'
import { type GameState } from '../../game'
import { assertNever } from '../../type-utils'
import { type BroadcastEvent } from '../../turns/events'
import { type ChronicleEntry } from './chronicle-entry'

/**
 * Pure conversion from broadcast (turn-pipeline) events to chronicle entries.
 *
 * Filters out noise: `salary` is high-frequency and uninteresting outside the
 * resource panel, `research` events that report progress only become entries
 * when `completed === true` (callers that want progress entries can pass the
 * partial flag). `turnRotated` becomes a single `turnAdvanced` entry keyed on
 * the *incoming* tribe so UI can render "Barbarians' turn 4" once per rotation.
 */
export function entriesFromBroadcastEvents(
	events: readonly BroadcastEvent[],
	turnAtEmit: number,
	options: { includeResearchProgress?: boolean } = {}
): readonly ChronicleEntry[] {
	const out: ChronicleEntry[] = []
	for (const event of events) {
		const entry = entryFromEvent(event, turnAtEmit, options)
		if (entry) {
			out.push(entry)
		}
	}
	return out
}

function entryFromEvent(
	event: BroadcastEvent,
	turnAtEmit: number,
	options: { includeResearchProgress?: boolean }
): ChronicleEntry | null {
	switch (event.type) {
		case 'salary': {
			return null
		}
		case 'research': {
			if (event.completed) {
				return {
					kind: 'researchCompleted',
					actorTribe: event.tribe,
					tech: event.tech,
					turn: turnAtEmit
				}
			}
			if (!options.includeResearchProgress) {
				return null
			}
			return {
				kind: 'researchProgress',
				actorTribe: event.tribe,
				tech: event.tech,
				turnsRemaining: event.turnsRemaining ?? 0,
				turn: turnAtEmit
			}
		}
		case 'villageLevel': {
			return {
				kind: 'villageLevelUp',
				actorTribe: event.tribe,
				levelUps: event.levelUps,
				turn: turnAtEmit
			}
		}
		case 'turnRotated': {
			return {
				kind: 'turnAdvanced',
				actorTribe: event.to,
				turn: event.turn
			}
		}
		case 'villageCaptured': {
			return {
				kind: 'villageCaptured',
				actorTribe: event.byTribe,
				targetTribe: event.fromTribe,
				position: event.at,
				turn: turnAtEmit
			}
		}
		case 'gameOver': {
			return {
				kind: 'gameOver',
				actorTribe: event.winner,
				turn: turnAtEmit
			}
		}
		default: {
			return assertNever(event)
		}
	}
}

/**
 * Pure conversion from {@link CombatEvent}[] to `unitDefeated` chronicle
 * entries. Combat events carry only unit IDs, so callers must pass the
 * pre-combat {@link GameState} (the one used to invoke `resolveCombat`) — we
 * look up the victim's tribe and last-known position there before the unit
 * was removed.
 *
 * `attackerTribe` is the tribe that issued the attack; counter-kills credit
 * the killer's tribe (the original defender) as the chronicle's actor so a
 * "Rogues counter killed your Caveman" reads correctly. Kills with no
 * matching unit in the pre-state (impossible in practice — kill events
 * reference units the resolver just inspected) are dropped silently.
 */
export function entriesFromCombatEvents(
	events: readonly CombatEvent[],
	preCombatState: GameState,
	attackerTribe: Tribe,
	turnAtEmit: number
): readonly ChronicleEntry[] {
	const out: ChronicleEntry[] = []
	for (const event of events) {
		if (event.type !== 'kill') {
			continue
		}
		const victim = lookupUnit(preCombatState, event.victimId)
		if (!victim) {
			continue
		}
		const killer = lookupUnit(preCombatState, event.killerId)
		// On counter-attacks the killer is the original defender, so the
		// "actor" of the kill is the killer's tribe — not the attacker.
		const actorTribe = killer?.unit.tribe ?? attackerTribe
		out.push({
			kind: 'unitDefeated',
			actorTribe,
			targetTribe: victim.unit.tribe,
			position: victim.position,
			turn: turnAtEmit
		})
	}
	return out
}

function lookupUnit(
	state: GameState,
	unitId: Unit['id']
): { unit: Unit; position: BoardPosition } | null {
	const unitState = state.units.unitStates[unitId]
	if (!unitState) {
		return null
	}
	const tile =
		state.units.board[unitState.position.r_idx]?.[unitState.position.q_idx]
	if (!tile?.unit || tile.unit.id !== unitId) {
		return null
	}
	return { unit: tile.unit, position: unitState.position }
}
