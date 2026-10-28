import { constVoid } from 'effect/Function'
import { createContext, useContext, useEffect } from 'react'
import { type Group } from 'three'

/**
 * Identity-stable Set of registered groups, shared between the provider's
 * single `useFrame` driver (`moveable-pulse-context.tsx`) and per-tile
 * registrations. Mutations don't re-render consumers — the provider observes
 * membership inside its frame loop.
 */
export type MoveablePulseGroupSet = Set<Group>

export const MoveablePulseContext = createContext<MoveablePulseGroupSet | null>(
	null
)

/**
 * Register a `Group` ref to receive the shared breathing scale every frame.
 * Returns the ref unchanged for convenience.
 */
export function useRegisterMoveablePulse(ref: React.RefObject<Group | null>) {
	const groups = useContext(MoveablePulseContext)
	useEffect(() => {
		const group = ref.current
		if (!group || !groups) {
			return constVoid
		}
		groups.add(group)
		return () => {
			groups.delete(group)
		}
	}, [ref, groups])
}
