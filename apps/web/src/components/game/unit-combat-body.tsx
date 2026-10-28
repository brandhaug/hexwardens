import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { type Group } from 'three'
import { defeatScale } from './unit-animation-timing'
import { type UnitAnimationOverride } from './unit-miniature'

/** Scale the miniature only; health badges and ownership markers stay readable. */
export function UnitCombatBody({
	animation,
	reducedMotion,
	children
}: {
	readonly animation: UnitAnimationOverride | undefined
	readonly reducedMotion: boolean
	readonly children: ReactNode
}) {
	const groupRef = useRef<Group>(null)
	const startedAt = useRef(0)
	useLayoutEffect(() => {
		startedAt.current = performance.now()
		groupRef.current?.scale.setScalar(1)
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new combat token restarts the same defeat animation.
	}, [animation?.token])
	useFrame(() => {
		const scale =
			animation?.state === 'death'
				? defeatScale(performance.now() - startedAt.current, reducedMotion)
				: 1
		groupRef.current?.scale.setScalar(scale)
	})
	return <group ref={groupRef}>{children}</group>
}
