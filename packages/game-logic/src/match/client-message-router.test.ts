import { Result } from 'effect'
import { WireDecodeError } from '../multiplayer/codec'
import { type ClientMessage } from '../multiplayer/types'
import {
	decodeClientMessage,
	routeClientMessage
} from './client-message-router'
import { type MatchCodec } from './ports'

describe('client message router', () => {
	it('routes end-turn to a Match command for the issuing tribe', () => {
		const msg: ClientMessage = { type: 'endTurn' }

		expect(routeClientMessage('barbarians', msg)).toEqual({
			kind: 'command',
			command: {
				kind: 'endTurn',
				tribe: 'barbarians'
			}
		})
	})

	it('returns a direct reply for unsupported in-match messages', () => {
		const msg: ClientMessage = { type: 'setReady', ready: true }

		expect(routeClientMessage('barbarians', msg)).toEqual({
			kind: 'reply',
			message: {
				type: 'error',
				message: 'Message type not valid in match context'
			}
		})
	})

	it('keeps raw decode failures as replies instead of dispatching commands', () => {
		const codec: MatchCodec = {
			decode: () =>
				Result.fail(
					new WireDecodeError({ message: 'bad payload', raw: 'nope' })
				)
		}

		const decoded = decodeClientMessage(codec, 'nope')

		expect(Result.isFailure(decoded)).toBe(true)
		assert(Result.isFailure(decoded))
		expect(decoded.failure).toEqual({
			type: 'error',
			message: 'bad payload'
		})
	})
})
