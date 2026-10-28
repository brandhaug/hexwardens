import { assertNever } from '@hexwardens/game-logic/type-utils'
import { type GameConnectionStatus } from './game-client'

export type ConnectionStatusPresentation = {
	title: string
	detail: string
	tone: 'neutral' | 'warning' | 'danger'
	actionLabel?: string
}

export function connectionStatusPresentation(
	status: GameConnectionStatus
): ConnectionStatusPresentation | null {
	switch (status.state) {
		case 'idle': {
			return null
		}
		case 'open': {
			return null
		}
		case 'connecting': {
			return {
				title: 'Joining match',
				detail: 'Restoring the latest board state.',
				tone: 'neutral'
			}
		}
		case 'reconnecting': {
			return {
				title: 'Reconnecting',
				detail: 'Actions will send after the match stream returns.',
				tone: 'warning'
			}
		}
		case 'closed': {
			return {
				title: 'Connection lost',
				detail: 'The match is paused on this device until the stream returns.',
				tone: 'danger',
				actionLabel: 'Reconnect'
			}
		}
		default: {
			return assertNever(status.state)
		}
	}
}
