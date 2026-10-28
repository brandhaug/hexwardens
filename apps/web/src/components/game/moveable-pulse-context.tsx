import { useFrame } from '@react-three/fiber'
import {
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
	MoveablePulseContext,
	type MoveablePulseGroupSet
} from './moveable-pulse-registry'

// Walkable tiles share a single global breathing phase — sin(t * ω) — so the
// indicator rings inhale/exhale in unison and read as one set rather than
// jittering independently. Slow enough (~1.8s) to feel calm, not alarming.
//
// Performance: instead of registering one `useFrame` callback per moveable
// tile (20+ identical sin-wave computations per frame), the provider runs
// ONE `useFrame` that computes the breath scale once and applies it
// imperatively to every registered group. Per-tile cost drops from a
// callback + Math.sin + scale.set to a single scale.set inside one loop.
const MOVEABLE_PULSE_OMEGA = (Math.PI * 2) / 1.8
const MOVEABLE_PULSE_AMPLITUDE = 0.02

/**
 * Single `useFrame` driver for every `MoveablePulse` on the board. Mount once
 * inside the R3F `<Canvas>` tree (e.g. as a child of the board scene group).
 * Children registered via `useRegisterMoveablePulse` get their group's scale
 * mutated each frame; no per-tile frame callback is allocated.
 */
export function MoveablePulseProvider({ children }: { children: ReactNode }) {
	// Identity-stable Set so we don't re-render consumers when membership
	// changes. Mutations to the Set are observed inside `useFrame`.
	const reducedMotion = useSyncExternalStore(
		subscribeReducedMotion,
		prefersReducedMotion,
		() => false
	)
	const groups = useMemo<MoveablePulseGroupSet>(() => new Set(), [])
	useFrame((state) => {
		if (groups.size === 0) {
			return
		}
		const breath = reducedMotion
			? 1
			: 1 +
				Math.sin(state.clock.elapsedTime * MOVEABLE_PULSE_OMEGA) *
					MOVEABLE_PULSE_AMPLITUDE
		for (const group of groups) {
			group.scale.set(breath, breath, 1)
		}
	})
	return (
		<MoveablePulseContext.Provider value={groups}>
			{children}
		</MoveablePulseContext.Provider>
	)
}
