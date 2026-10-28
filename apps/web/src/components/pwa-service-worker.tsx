import { constVoid } from 'effect/Function'
import { useEffect } from 'react'
import { toast } from 'sonner'

/** Game tabs stay open for hours without navigating, so the service worker
 * never sees a new deploy on its own — poll for updates explicitly. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function PwaServiceWorker() {
	useEffect(() => {
		if (!('serviceWorker' in navigator)) {
			return constVoid
		}
		if (import.meta.env.DEV) {
			// `vite preview` shares port 3001 with the dev server, so a service
			// worker registered there keeps controlling localhost in dev and
			// serves stale HTML/assets — which surfaces as hydration mismatches.
			// Evict any leftover registration instead of just skipping.
			void navigator.serviceWorker.getRegistrations().then((regs) => {
				for (const reg of regs) {
					void reg.unregister()
				}
				return null
			})
			return constVoid
		}
		let disposed = false
		let updateInterval: ReturnType<typeof setInterval> | null = null

		// `controllerchange` with a pre-existing controller means a new deploy
		// took over while this tab is open — the running bundle is now stale.
		// Without a controller it's just the first install claiming the page.
		let sawController = navigator.serviceWorker.controller !== null
		const onControllerChange = () => {
			if (sawController) {
				toast.info('A new version is available', {
					duration: Infinity,
					action: {
						label: 'Reload',
						onClick: () => window.location.reload()
					}
				})
			}
			sawController = true
		}
		navigator.serviceWorker.addEventListener(
			'controllerchange',
			onControllerChange
		)

		void import('virtual:pwa-register').then(({ registerSW }) => {
			if (disposed) {
				return null
			}
			registerSW({
				immediate: true,
				onRegisteredSW(_swUrl, registration) {
					if (disposed || !registration) {
						return
					}
					updateInterval = setInterval(
						() => void registration.update(),
						UPDATE_CHECK_INTERVAL_MS
					)
				}
			})
			return null
		})
		return () => {
			disposed = true
			if (updateInterval !== null) {
				clearInterval(updateInterval)
			}
			navigator.serviceWorker.removeEventListener(
				'controllerchange',
				onControllerChange
			)
		}
	}, [])

	return null
}
