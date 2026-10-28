import { constVoid } from 'effect/Function'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
	AnimationMixer,
	LoopOnce,
	LoopRepeat,
	type AnimationAction,
	type AnimationClip,
	type Object3D
} from 'three'
import {
	animationStateToLibrary,
	rigClips,
	type AnimationLibraryKind,
	type UnitAnimationState
} from './animation-clips'
import { type AssetRig } from './visual-registry-types'
import { combatAnimationTiming } from './unit-animation-timing'

/**
 * Owns the AnimationMixer + Action lifecycle for a rigged Unit. The hook
 * encapsulates clip lookup (via `rigClips` and `animationStateToLibrary`),
 * loop-mode selection, reduced-motion shaping, and per-frame mixer
 * updates. The pure `unitAnimationActionConfig` exposes the rule so tests
 * can lock in the behavior without rendering Three.js.
 */

export type UnitAnimationSets = Record<
	AnimationLibraryKind,
	readonly AnimationClip[]
>

export interface UnitAnimationActionConfig {
	readonly loop: 'repeat' | 'once'
	readonly timeScale: number
	readonly clampWhenFinished: boolean
	readonly pauseAtZero: boolean
}

export function unitAnimationActionConfig(
	state: UnitAnimationState,
	reducedMotion: boolean
): UnitAnimationActionConfig {
	const shouldLoop = state === 'idle' || state === 'walk'
	return {
		loop: shouldLoop ? 'repeat' : 'once',
		timeScale: reducedMotion && !shouldLoop ? 0.3 : 1,
		clampWhenFinished: !shouldLoop,
		pauseAtZero: reducedMotion && state === 'idle'
	}
}

export interface UnitAnimationMixerInput {
	readonly rig: AssetRig
	readonly state: UnitAnimationState
	readonly token: number
	readonly reducedMotion: boolean
	readonly animationSets: UnitAnimationSets
	readonly root: Object3D
}

interface MixerHolder {
	mixer?: AnimationMixer
	action?: AnimationAction
}

export function useUnitAnimationMixer(input: UnitAnimationMixerInput): void {
	const { rig, state, token, reducedMotion, animationSets, root } = input
	const holderRef = useRef<MixerHolder>({})
	const clipName = rigClips[rig][state]
	const libraryKind = animationStateToLibrary[state]

	useEffect(() => {
		const holder = holderRef.current
		const mixer = new AnimationMixer(root)
		holder.mixer = mixer
		return () => {
			mixer.stopAllAction()
			mixer.uncacheRoot(root)
			delete holder.mixer
			delete holder.action
		}
	}, [root])

	useEffect(() => {
		const animations = animationSets[libraryKind]
		const clip = animations.find((candidate) => candidate.name === clipName)
		if (!clip) {
			return constVoid
		}
		const config = unitAnimationActionConfig(state, reducedMotion)
		const holder = holderRef.current
		const mixer = holder.mixer
		if (!mixer) {
			return constVoid
		}
		const previous = holder.action
		const action = mixer.clipAction(clip)
		action.reset()
		action.setLoop(
			config.loop === 'repeat' ? LoopRepeat : LoopOnce,
			config.loop === 'repeat' ? Infinity : 1
		)
		action.clampWhenFinished = config.clampWhenFinished
		action.timeScale = config.timeScale
		// Complete each one-shot before the board clears its override.
		if (state !== 'idle' && state !== 'walk' && !reducedMotion) {
			action.setDuration(combatAnimationTiming[state].clipSeconds)
		}
		action.play()
		if (previous && previous !== action && !reducedMotion) {
			action.crossFadeFrom(previous, 0.1, false)
		} else if (previous && previous !== action) {
			previous.stop()
		}
		if (reducedMotion) {
			action.paused = true
			action.time = config.pauseAtZero ? 0 : clip.duration * 0.35
			mixer.update(0)
		}
		holder.action = action
		return constVoid
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new token intentionally replays the same animation clip.
	}, [animationSets, clipName, libraryKind, reducedMotion, root, state, token])

	useFrame((_, delta) => {
		if (!reducedMotion) {
			holderRef.current.mixer?.update(Math.min(delta, 0.1))
		}
	})
}
