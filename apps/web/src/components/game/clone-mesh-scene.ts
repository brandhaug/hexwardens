import { SkinnedMesh, type Object3D, type Skeleton } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { centerObject } from './gltf-loader'
import { applyTint } from './mesh-tint'

/** Own only the cloned materials and skeletons; geometry and textures stay cached. */
export function cloneMeshScene(
	scene: Object3D,
	tintColor?: string,
	tintMaterial?: string
) {
	const root = cloneSkeleton(scene)
	const materials = tintColor ? applyTint(root, tintColor, tintMaterial) : []
	const skeletons = new Set<Skeleton>()
	root.traverse((object) => {
		if (object instanceof SkinnedMesh) {
			skeletons.add(object.skeleton)
		}
	})
	return {
		...centerObject(root),
		dispose: () => {
			for (const material of materials) {
				material.dispose()
			}
			for (const skeleton of skeletons) {
				skeleton.dispose()
			}
		}
	}
}
