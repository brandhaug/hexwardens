import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { Box3, Vector3, type Object3D } from 'three'
import { type GLTF } from 'three-stdlib'

/**
 * Single seam for GLB asset loading. Every renderer that needs a scene or
 * animation clips reaches for this module — never `@react-three/drei`'s
 * `useGLTF` directly — so caching strategy, error-boundary policy, and
 * centering helpers stay in one place.
 */

export type GltfAsset = GLTF

export function useGltfAsset(path: string): GltfAsset {
	return useGLTF(path)
}

export function useGltfAssets(paths: readonly string[]): readonly GltfAsset[] {
	const assets = useGLTF([...paths])
	// `useGLTF` returns a fresh outer array on every render even when the
	// paths and underlying scenes are unchanged (drei caches by URL but
	// reassembles the wrapper). Downstream `useMemo`s that include the
	// array in their dep list would otherwise recompute on every parent
	// re-render — restarting `AnimationMixer`s and flickering idle anims.
	const key = paths.join('|')
	// eslint-disable-next-line react-hooks/exhaustive-deps
	return useMemo(() => assets, [key])
}

export interface CenteredScene {
	readonly root: Object3D
	readonly maxDim: number
}

export function centerObject(root: Object3D): CenteredScene {
	root.updateMatrixWorld(true)
	const bbox = new Box3().setFromObject(root)
	const center = bbox.getCenter(new Vector3())
	const size = bbox.getSize(new Vector3())
	root.position.set(-center.x, -bbox.min.y, -center.z)
	return { root, maxDim: Math.max(size.x, size.y, size.z) }
}
