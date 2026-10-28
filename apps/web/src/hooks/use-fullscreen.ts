import { constVoid } from 'effect/Function'
import { useCallback, useEffect, useState } from 'react'

/**
 * Track and toggle the document's fullscreen state.
 *
 * Browser support: works in every desktop browser; on iOS Safari the
 * Fullscreen API only works on video elements, so `isSupported` is `false`
 * there and the toggle no-ops. PWAs installed via "Add to Home Screen"
 * already run fullscreen on iOS, so the missing API is rarely a problem
 * in the intended deployment context.
 */
export function useFullscreen() {
	const [isFullscreen, setIsFullscreen] = useState<boolean>(
		() => typeof document !== 'undefined' && document.fullscreenElement !== null
	)

	useEffect(() => {
		if (typeof document === 'undefined') {
			return constVoid
		}
		const sync = () => setIsFullscreen(document.fullscreenElement !== null)
		document.addEventListener('fullscreenchange', sync)
		return () => document.removeEventListener('fullscreenchange', sync)
	}, [])

	const isSupported =
		// oxlint-disable-next-line typescript/prefer-optional-chain -- The typeof guard must precede document access during SSR, where document is unbound.
		typeof document !== 'undefined' && document.fullscreenEnabled

	const toggle = useCallback(() => {
		if (!isSupported) {
			return
		}
		if (document.fullscreenElement === null) {
			void document.documentElement.requestFullscreen().catch(() => {
				// Browsers reject requestFullscreen if the call doesn't trace
				// back to a user gesture. The menu is opened by a tap, so this
				// shouldn't happen in practice — quiet the rejection regardless.
			})
		} else {
			void document.exitFullscreen().catch(constVoid)
		}
	}, [isSupported])

	return { isFullscreen, isSupported, toggle }
}
