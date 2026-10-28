import { assertNever } from '../type-utils'
import { Result } from 'effect'
import { type Tribe } from '../domains/tribe'
import { type ClientMessage, type ServerMessage } from '../multiplayer/types'
import { wireActionToAction } from './wire-intent'
import { type MatchCodec } from './ports'
import { type MatchCommand } from './types'

export type RoutedClientMessage =
	| { kind: 'command'; command: MatchCommand }
	| { kind: 'reply'; message: ServerMessage }

export function routeClientMessage(
	tribe: Tribe,
	msg: ClientMessage
): RoutedClientMessage {
	switch (msg.type) {
		case 'action': {
			const action = msg.action
			if (action.type !== 'move' && action.type !== 'attack') {
				return {
					kind: 'reply',
					message: {
						type: 'actionResult',
						success: false,
						message: `Unsupported action type: ${action.type}`
					}
				}
			}
			return {
				kind: 'command',
				command: {
					kind: 'perform',
					tribe,
					intent: {
						kind: action.type,
						from: { r_idx: action.from.r, q_idx: action.from.q },
						to: { r_idx: action.to.r, q_idx: action.to.q }
					}
				}
			}
		}
		case 'actionRequest': {
			return {
				kind: 'command',
				command: {
					kind: 'perform',
					tribe,
					intent: {
						kind: 'tileAction',
						action: wireActionToAction(msg.action)
					}
				}
			}
		}
		case 'endTurn': {
			return {
				kind: 'command',
				command: {
					kind: 'endTurn',
					tribe
				}
			}
		}
		case 'configureLobby':
		case 'setReady':
		case 'setSlotBot':
		case 'setTribe':
		case 'startGame': {
			return {
				kind: 'reply',
				message: {
					type: 'error',
					message: 'Message type not valid in match context'
				}
			}
		}
	}
	return assertNever(msg)
}

export function decodeClientMessage(
	codec: MatchCodec,
	raw: string
): Result.Result<ClientMessage, ServerMessage> {
	const decoded = codec.decode(raw)
	if (Result.isFailure(decoded)) {
		return Result.fail({ type: 'error', message: decoded.failure.message })
	}
	return Result.succeed(decoded.success)
}
