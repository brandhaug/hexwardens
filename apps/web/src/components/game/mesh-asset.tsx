import {
	AUTO_SCALE_TARGET_SIZE,
	MESH_VISUAL_SCALE_MULTIPLIER
} from './mesh-scale'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { useGltfAsset } from './gltf-loader'
import { cloneMeshScene } from './clone-mesh-scene'

interface MeshAssetProps {
	readonly path: string
	readonly tintMaterial?: string | undefined
	readonly tintColor?: string | undefined
	readonly scale?: number | undefined
}

export function MeshAsset({
	path,
	tintMaterial,
	tintColor,
	scale
}: MeshAssetProps) {
	return (
		<MeshAssetErrorBoundary key={path} path={path}>
			<Suspense fallback={null}>
				<MeshAssetInner
					path={path}
					tintMaterial={tintMaterial}
					tintColor={tintColor}
					scale={scale}
				/>
			</Suspense>
		</MeshAssetErrorBoundary>
	)
}

function MeshAssetInner({
	path,
	tintMaterial,
	tintColor,
	scale
}: MeshAssetProps) {
	const { scene } = useGltfAsset(path)
	const centered = useMemo(
		() => cloneMeshScene(scene, tintColor, tintMaterial),
		[scene, tintColor, tintMaterial]
	)
	useEffect(() => centered.dispose, [centered])
	const resolvedScale = useMemo(() => {
		const baseScale =
			scale ??
			(Number.isFinite(centered.maxDim) && centered.maxDim > 0
				? AUTO_SCALE_TARGET_SIZE / centered.maxDim
				: 1)
		return baseScale * MESH_VISUAL_SCALE_MULTIPLIER
	}, [centered, scale])
	return (
		<group scale={[resolvedScale, resolvedScale, resolvedScale]}>
			<primitive object={centered.root} />
		</group>
	)
}

interface MeshAssetErrorBoundaryProps {
	readonly path: string
	readonly children: ReactNode
}

interface MeshAssetErrorBoundaryState {
	readonly error: Error | null
}

export class MeshAssetErrorBoundary extends Component<
	MeshAssetErrorBoundaryProps,
	MeshAssetErrorBoundaryState
> {
	state: MeshAssetErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): MeshAssetErrorBoundaryState {
		return { error }
	}

	render() {
		if (this.state.error) {
			return <FailedMeshMarker path={this.props.path} />
		}
		return this.props.children
	}
}

function FailedMeshMarker({ path }: { readonly path: string }) {
	return (
		<mesh name={`Failed to load ${path}`}>
			<boxGeometry args={[0.4, 0.4, 0.4]} />
			<meshStandardMaterial color='#ff00ff' wireframe />
		</mesh>
	)
}
