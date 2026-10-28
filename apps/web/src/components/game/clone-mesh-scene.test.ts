import {
	Bone,
	BoxGeometry,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshStandardMaterial,
	Skeleton,
	SkinnedMesh,
	Texture,
	Uint16BufferAttribute
} from 'three'
import { cloneMeshScene } from './clone-mesh-scene'

describe('cloned mesh ownership', () => {
	it('shares one tint per source material and disposes only owned resources', () => {
		const geometry = new BoxGeometry()
		const texture = new Texture()
		const marker = new MeshStandardMaterial({ color: '#ff0000', map: texture })
		marker.name = 'team'
		const untouched = new MeshStandardMaterial({ color: '#ffffff' })
		const source = new Group()
		source.add(
			new Mesh(geometry, [marker, untouched]),
			new Mesh(geometry, marker)
		)
		const cachedDisposal = vi.fn<() => void>()
		for (const resource of [geometry, texture, marker, untouched]) {
			resource.addEventListener('dispose', cachedDisposal)
		}

		const first = cloneMeshScene(source, '#00ff00', 'team')
		const second = cloneMeshScene(source, '#0000ff', 'team')
		const firstMaterials = new Set<MeshStandardMaterial>()
		first.root.traverse((object) => {
			if (object instanceof Mesh) {
				const materials = Array.isArray(object.material)
					? object.material
					: [object.material]
				for (const material of materials) {
					if (
						material instanceof MeshStandardMaterial &&
						material !== untouched
					) {
						firstMaterials.add(material)
					}
				}
			}
		})
		expect(firstMaterials.size).toBe(1)
		const ownedDisposal = vi.fn<() => void>()
		for (const material of firstMaterials) {
			expect(material).not.toBe(marker)
			expect(material.map).toBe(texture)
			expect(material.color.getHexString()).toBe('00ff00')
			material.addEventListener('dispose', ownedDisposal)
		}
		const otherInstanceDisposal = vi.fn<() => void>()
		second.root.traverse((object) => {
			if (
				object instanceof Mesh &&
				object.material instanceof MeshStandardMaterial
			) {
				object.material.addEventListener('dispose', otherInstanceDisposal)
			}
		})
		first.dispose()
		expect(ownedDisposal).toHaveBeenCalledTimes(1)
		expect(cachedDisposal).not.toHaveBeenCalled()
		expect(otherInstanceDisposal).not.toHaveBeenCalled()
		expect(marker.color.getHexString()).toBe('ff0000')
		second.dispose()
	})

	it('releases cloned skeleton bone textures without touching the loaded skeleton', () => {
		const geometry = new BoxGeometry()
		const vertexCount = geometry.getAttribute('position').count
		geometry.setAttribute(
			'skinIndex',
			new Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4)
		)
		const weights = new Float32Array(vertexCount * 4)
		for (let i = 0; i < vertexCount; i++) {
			weights[i * 4] = 1
		}
		geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
		const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial())
		const bone = new Bone()
		mesh.add(bone)
		mesh.bind(new Skeleton([bone]))
		mesh.skeleton.computeBoneTexture()
		const originalTexture = mesh.skeleton.boneTexture
		const source = new Group()
		source.add(mesh)
		const cloned = cloneMeshScene(source)
		const skeletonDisposal = vi.fn<() => void>()
		const clonedSkeletons: Skeleton[] = []
		cloned.root.traverse((object) => {
			if (object instanceof SkinnedMesh) {
				clonedSkeletons.push(object.skeleton)
				object.skeleton.computeBoneTexture()
				object.skeleton.boneTexture?.addEventListener(
					'dispose',
					skeletonDisposal
				)
			}
		})
		expect(clonedSkeletons).toHaveLength(1)
		expect(clonedSkeletons[0]).not.toBe(mesh.skeleton)
		cloned.dispose()
		expect(skeletonDisposal).toHaveBeenCalledTimes(1)
		expect(mesh.skeleton.boneTexture).toBe(originalTexture)
		mesh.skeleton.dispose()
	})
})
