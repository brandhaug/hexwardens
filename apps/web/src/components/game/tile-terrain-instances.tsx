import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
	Color,
	Material,
	Matrix4,
	Mesh,
	type InstancedMesh,
	type Object3D
} from 'three'
import { type BoardWorldPosition } from './board-position-to-world'
import { useGltfAsset } from './gltf-loader'

interface ColorableMaterial extends Material {
	color: Color
}

function isColorableMaterial(m: unknown): m is ColorableMaterial {
	return (
		m instanceof Material &&
		'isMeshStandardMaterial' in m &&
		m.isMeshStandardMaterial === true
	)
}

interface InstancedMeshSource {
	readonly geometry: Mesh['geometry']
	readonly material: Mesh['material']
}

function isInstancedMeshSource(obj: unknown): obj is InstancedMeshSource {
	return obj instanceof Mesh && 'geometry' in obj && 'material' in obj
}

function findFirstMesh(root: Object3D): InstancedMeshSource | null {
	let mesh: InstancedMeshSource | null = null
	root.traverse((obj) => {
		if (!mesh && isInstancedMeshSource(obj)) {
			mesh = obj
		}
	})
	return mesh
}

interface TerrainInstancesProps {
	readonly path: string
	readonly color: string
	readonly positions: readonly BoardWorldPosition[]
}

export function TerrainInstances({
	path,
	color,
	positions
}: TerrainInstancesProps) {
	const { scene } = useGltfAsset(path)
	const mesh = useMemo(() => findFirstMesh(scene), [scene])
	const material = useMemo(() => {
		if (!mesh) {
			return null
		}
		if (!isColorableMaterial(mesh.material)) {
			return mesh.material
		}
		const cloned = mesh.material.clone()
		cloned.color = new Color(color)
		return cloned
	}, [mesh, color])
	useEffect(() => {
		return () => {
			if (material && material !== mesh?.material && !Array.isArray(material)) {
				material.dispose()
			}
		}
	}, [material, mesh])
	const instancesRef = useRef<InstancedMesh>(null)
	useLayoutEffect(() => {
		const instances = instancesRef.current
		if (!instances) {
			return
		}
		const matrix = new Matrix4()
		positions.forEach(([x, y, z], index) => {
			instances.setMatrixAt(index, matrix.makeTranslation(x, y, z))
		})
		instances.instanceMatrix.needsUpdate = true
		instances.computeBoundingSphere()
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- R3F reconstructs the mesh when geometry or material constructor arguments change.
	}, [mesh, material, positions])
	if (!mesh || !material) {
		return null
	}
	return (
		<instancedMesh
			ref={instancesRef}
			args={[mesh.geometry, material, positions.length]}
		/>
	)
}
