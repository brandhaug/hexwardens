import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useSyncExternalStore } from 'react'
import { type Mesh } from 'three'
import { mulberry32 } from './tile-rng'
import {
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'

const RIPPLE_COUNT = 4
const RIPPLE_DROP_REGION = 0.34
const RIPPLE_MIN_SCALE = 0.04
const RIPPLE_FADE_IN = 0.07

interface WaterRipple {
	readonly x: number
	readonly z: number
	readonly y: number
	readonly phaseOffset: number
	readonly period: number
	readonly maxScale: number
	readonly peakOpacity: number
}

function generateWaterRipples(seed: number): readonly WaterRipple[] {
	const rand = mulberry32(Math.abs(Math.round(seed * 1000)) || 1)
	const ripples: WaterRipple[] = []
	for (let i = 0; i < RIPPLE_COUNT; i++) {
		const angle = rand() * Math.PI * 2
		const distance = rand() * RIPPLE_DROP_REGION
		ripples.push({
			x: Math.cos(angle) * distance,
			z: Math.sin(angle) * distance,
			y: 0.014 + i * 0.0008,
			phaseOffset: i / RIPPLE_COUNT + (rand() - 0.5) * 0.16,
			period: 2.8 + rand() * 1.2,
			maxScale: 0.36 + rand() * 0.22,
			peakOpacity: 0.34 + rand() * 0.18
		})
	}
	return ripples
}

interface WaterShimmerProps {
	readonly topY: number
	readonly seed: number
}

export function WaterShimmer({ topY, seed }: WaterShimmerProps) {
	const ripples = useMemo(() => generateWaterRipples(seed), [seed])
	const meshRefs = useRef<Mesh[]>([])
	const reducedMotion = useSyncExternalStore(
		subscribeReducedMotion,
		prefersReducedMotion,
		() => true
	)
	useFrame((state) => {
		const t = reducedMotion ? 0 : state.clock.elapsedTime
		for (let i = 0; i < ripples.length; i++) {
			const mesh = meshRefs.current[i]
			const ripple = ripples[i]
			if (!mesh || !ripple) {
				continue
			}
			const cyclePhase = (t / ripple.period + ripple.phaseOffset) % 1
			// Ease-out expansion: ring spreads fast at first, slows as energy dissipates.
			const expansion = 1 - (1 - cyclePhase) * (1 - cyclePhase)
			const scale =
				RIPPLE_MIN_SCALE + expansion * (ripple.maxScale - RIPPLE_MIN_SCALE)
			mesh.scale.set(scale, scale, 1)
			// Quick fade-in at drop, then quadratic fade-out — crest height drops as wave spreads.
			const fadeIn = Math.min(1, cyclePhase / RIPPLE_FADE_IN)
			const remaining = 1 - cyclePhase
			const opacity = fadeIn * remaining * remaining * ripple.peakOpacity
			if (Array.isArray(mesh.material)) {
				for (const material of mesh.material) {
					material.opacity = opacity
				}
			} else {
				mesh.material.opacity = opacity
			}
		}
	})
	return (
		<group>
			{ripples.map((ripple, i) => (
				<mesh
					key={`${ripple.x}:${ripple.z}`}
					ref={(el) => {
						if (el) {
							meshRefs.current[i] = el
						}
					}}
					position={[ripple.x, topY + ripple.y, ripple.z]}
					rotation={[-Math.PI / 2, 0, 0]}
				>
					<ringGeometry args={[0.94, 1, 36]} />
					<meshBasicMaterial
						color='#f2fbff'
						transparent
						opacity={0}
						depthWrite={false}
					/>
				</mesh>
			))}
		</group>
	)
}
