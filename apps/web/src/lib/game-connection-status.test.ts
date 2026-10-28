import { describe, expect, it } from 'vite-plus/test'
import { connectionStatusPresentation } from './game-connection-status'
import { type GameConnectionStatus } from './game-client'

function status(state: GameConnectionStatus['state']): GameConnectionStatus {
	return {
		state,
		lastMessageAt: null,
		lastServerSequence: null
	}
}

describe('connectionStatusPresentation', () => {
	it('hides healthy open connections', () => {
		expect(connectionStatusPresentation(status('open'))).toBeNull()
	})

	it('surfaces initial connection and reconnect recovery states', () => {
		expect(connectionStatusPresentation(status('connecting'))?.title).toBe(
			'Joining match'
		)
		expect(connectionStatusPresentation(status('reconnecting'))?.tone).toBe(
			'warning'
		)
	})

	it('surfaces closed connections as an error state', () => {
		const presentation = connectionStatusPresentation(status('closed'))
		expect(presentation?.tone).toBe('danger')
		expect(presentation?.actionLabel).toBe('Reconnect')
	})
})
