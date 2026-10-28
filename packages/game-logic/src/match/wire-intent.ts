import { type ActionIntent } from '../actions/intent'
import { type BoardPosition } from '../board/position'
import { type Intent } from '../dispatch'
import { type ClientMessage, type WireActionIntent } from '../multiplayer/types'
import { assertNever } from '../type-utils'

function toHex(pos: BoardPosition) {
	return { q: pos.q_idx, r: pos.r_idx, s: -pos.q_idx - pos.r_idx }
}

/**
 * Translate an internal {@link Intent} into the matching `ClientMessage`
 * variant the server routes through `client-message-router`. Move/Attack go
 * out as `{ type: 'action' }` carrying a `GameAction`; tile-Actions go out
 * as `{ type: 'actionRequest' }` carrying a `WireActionIntent`. Used by the
 * eager-send path on both the offline `match.send` boundary and the online
 * WebSocket transport — there is no client-side staging.
 */
export function intentToClientMessage(intent: Intent): ClientMessage {
	switch (intent.kind) {
		case 'move': {
			return {
				type: 'action',
				action: {
					type: 'move',
					from: toHex(intent.from),
					to: toHex(intent.to)
				}
			}
		}
		case 'attack': {
			return {
				type: 'action',
				action: {
					type: 'attack',
					from: toHex(intent.from),
					to: toHex(intent.to)
				}
			}
		}
		case 'tileAction': {
			return {
				type: 'actionRequest',
				action: actionToWireAction(intent.action)
			}
		}
		default: {
			return assertNever(intent)
		}
	}
}

function actionToWireAction(action: ActionIntent): WireActionIntent {
	const at = toHex(action.at)
	switch (action.kind) {
		case 'train': {
			return { kind: 'train', at, unit: action.unit }
		}
		case 'research': {
			return { kind: 'research', at, tech: action.tech }
		}
		case 'selectPerk': {
			return { kind: 'selectPerk', at, perk: action.perk }
		}
		case 'build':
		case 'capture':
		case 'collect':
		case 'explore':
		case 'heal':
		case 'recover':
		case 'retire':
		case 'upgrade-to-large': {
			return { kind: action.kind, at }
		}
	}
	return assertNever(action)
}

export function wireActionToAction(action: WireActionIntent): ActionIntent {
	const at = { r_idx: action.at.r, q_idx: action.at.q }
	switch (action.kind) {
		case 'train': {
			return { kind: 'train', at, unit: action.unit }
		}
		case 'research': {
			return { kind: 'research', at, tech: action.tech }
		}
		case 'selectPerk': {
			return { kind: 'selectPerk', at, perk: action.perk }
		}
		case 'build':
		case 'capture':
		case 'collect':
		case 'explore':
		case 'heal':
		case 'recover':
		case 'retire':
		case 'upgrade-to-large': {
			return { kind: action.kind, at }
		}
	}
	return assertNever(action)
}
