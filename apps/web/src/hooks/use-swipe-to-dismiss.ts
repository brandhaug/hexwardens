import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseSwipeToDismissOptions {
	readonly onDismiss: () => void
	/**
	 * Distance in CSS pixels the user must drag past before release commits
	 * the dismissal. Defaults to 120 — about a thumb's length on a phone.
	 */
	readonly distanceThreshold?: number
	/**
	 * Release velocity in px/ms above which any positive delta dismisses.
	 * Lets a fast flick close the sheet even if it didn't travel far.
	 */
	readonly velocityThreshold?: number
	/**
	 * When false, the hook is inert. Useful to disable mid-render (e.g. the
	 * dialog is closing) without unmounting the bound element.
	 */
	readonly enabled?: boolean
}

export interface SwipeToDismissBindings {
	/**
	 * The current vertical drag offset, in CSS pixels. Always >= 0 — upward
	 * drags clamp to zero so the panel never floats above its docked
	 * position. Apply via `translate3d(0, offset, 0)` on the dragged element.
	 */
	readonly offset: number
	/**
	 * True while the user's finger is down. Use this to suspend the snap-back
	 * transition so the panel tracks the finger 1:1 instead of easing.
	 */
	readonly isDragging: boolean
	/**
	 * Spread onto the draggable element. Internally uses Pointer Events and
	 * is restricted to `pointerType === 'touch'` so mouse drags on desktop
	 * aren't hijacked.
	 */
	readonly handlers: {
		readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
		readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
		readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
		readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
	}
}

/**
 * Swipe-down-to-dismiss gesture for bottom-sheet style panels on touch
 * devices. The dragged element follows the finger via the returned
 * `offset`, and release either commits (`onDismiss`) or snaps back to 0.
 *
 * Mouse and pen input are ignored so desktop drag-selection and keyboard
 * focus paths are untouched. The hook tracks only one pointer at a time —
 * a second finger landing while a drag is in flight is dropped on the
 * floor (no multitouch chord).
 */
export function useSwipeToDismiss(
	options: UseSwipeToDismissOptions
): SwipeToDismissBindings {
	const {
		onDismiss,
		distanceThreshold = 120,
		velocityThreshold = 0.5,
		enabled = true
	} = options

	const [previousEnabled, setPreviousEnabled] = useState(enabled)
	const [offset, setOffset] = useState(0)
	const [isDragging, setIsDragging] = useState(false)

	// Active pointer's identity + origin. Stored in a ref so the move/up
	// handlers don't re-bind on every render.
	const activePointerRef = useRef<{
		id: number
		startY: number
		startTime: number
	} | null>(null)

	if (previousEnabled !== enabled) {
		setPreviousEnabled(enabled)
		if (!enabled) {
			setOffset(0)
			setIsDragging(false)
		}
	}
	useEffect(() => {
		if (!enabled) {
			activePointerRef.current = null
		}
	}, [enabled])

	const endDrag = useCallback(() => {
		activePointerRef.current = null
		setIsDragging(false)
		setOffset(0)
	}, [])

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (!enabled) {
				return
			}
			// Coarse pointers only — don't hijack desktop drag.
			if (event.pointerType !== 'touch') {
				return
			}
			// Ignore secondary fingers when a gesture is already in flight.
			if (activePointerRef.current !== null) {
				return
			}
			activePointerRef.current = {
				id: event.pointerId,
				startY: event.clientY,
				startTime: event.timeStamp
			}
			setIsDragging(true)
		},
		[enabled]
	)

	const onPointerMove = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const active = activePointerRef.current
			if (!active || active.id !== event.pointerId) {
				return
			}
			// Clamp to >= 0 so an upward drag doesn't lift the panel above
			// its docked Y. We never want the panel to float.
			const delta = Math.max(0, event.clientY - active.startY)
			setOffset(delta)
		},
		[]
	)

	const onPointerUp = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const active = activePointerRef.current
			if (!active || active.id !== event.pointerId) {
				return
			}
			const delta = Math.max(0, event.clientY - active.startY)
			const elapsed = Math.max(1, event.timeStamp - active.startTime)
			const velocity = delta / elapsed
			const shouldDismiss =
				delta > distanceThreshold || velocity > velocityThreshold
			endDrag()
			if (shouldDismiss) {
				onDismiss()
			}
		},
		[distanceThreshold, endDrag, onDismiss, velocityThreshold]
	)

	const onPointerCancel = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const active = activePointerRef.current
			if (!active || active.id !== event.pointerId) {
				return
			}
			endDrag()
		},
		[endDrag]
	)

	return {
		offset,
		isDragging,
		handlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel
		}
	}
}
