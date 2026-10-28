import { constVoid } from 'effect/Function'
import { useSyncExternalStore } from 'react'

const subscribe = () => constVoid

/**
 * `false` during SSR and the hydration render, `true` from the first
 * post-hydration render onward.
 *
 * Gate any markup that depends on client-only stores (better-auth session,
 * effect-atom queries) behind this. Those stores can resolve while React is
 * still hydrating a code-split route chunk; if the hydration render then reads
 * the resolved value, it no longer matches the server HTML and React throws a
 * hydration mismatch and re-renders the boundary from scratch. Reading via
 * `useSyncExternalStore` with a server snapshot of `false` pins the hydration
 * render to the SSR output regardless of store timing.
 */
export function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false
	)
}
