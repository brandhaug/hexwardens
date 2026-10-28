import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseTapToConfirmOptions {
	readonly onCommit: () => void
	readonly onArm?: () => void
	readonly timeoutMs?: number
}

export interface TapToConfirm {
	readonly armed: boolean
	readonly trigger: () => void
	readonly reset: () => void
}

/**
 * Two-tap confirmation for destructive or irreversible actions on touch
 * surfaces. The first call to `trigger()` arms the button (fires `onArm`)
 * and starts a timeout that disarms it. A second call inside the window
 * fires `onCommit` and clears the timeout. `reset()` lets callers bail
 * out without firing — e.g. a popover closing before the user confirms.
 */
export function useTapToConfirm(options: UseTapToConfirmOptions): TapToConfirm {
	const { onCommit, onArm, timeoutMs = 3000 } = options
	const [armed, setArmed] = useState(false)
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const clearPendingTimeout = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
			timeoutRef.current = null
		}
	}, [])

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])

	const reset = useCallback(() => {
		clearPendingTimeout()
		setArmed(false)
	}, [clearPendingTimeout])

	const trigger = useCallback(() => {
		if (armed) {
			clearPendingTimeout()
			setArmed(false)
			onCommit()
			return
		}
		setArmed(true)
		onArm?.()
		timeoutRef.current = setTimeout(() => {
			timeoutRef.current = null
			setArmed(false)
		}, timeoutMs)
	}, [armed, clearPendingTimeout, onArm, onCommit, timeoutMs])

	return { armed, trigger, reset }
}
