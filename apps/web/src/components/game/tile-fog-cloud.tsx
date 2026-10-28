import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useSyncExternalStore } from 'react'
import { Color, type Group, type Material, Mesh, type Object3D } from 'three'
import { type BoardRenderEntry } from './board-render-data'
import { centerObject, useGltfAsset, type CenteredScene } from './gltf-loader'
import { hexCircleArgs, hexPrismArgs } from './tile-geometry'
import { mulberry32, tileSeedFromWorld } from './tile-rng'
import {
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'

const FOG_BASE_HEIGHT = 0.48
// Match the land tile silhouette — fog prism top sits flush with the land top
// (y=0). The dark colors + clouds carry the "unexplored" cue; matching height
// keeps the board surface visually level.
const FOG_BASE_TOP_Y = 0
const FOG_BASE_CENTER_Y = FOG_BASE_TOP_Y - FOG_BASE_HEIGHT / 2 - 0.005
const FOG_BASE_RADIUS = 0.985
// Inner top hex sits just above the prism's top cap at a smaller radius so the
// dark rim of the cap shows through as the "wrap" — mirrors how land terrain
// GLBs (recessed by LAND_MESH_RECESS_Y) let the prism's top rim peek above.
const FOG_TOP_RADIUS = 0.87
const FOG_TOP_Y = FOG_BASE_TOP_Y + 0.02
const FOG_CLUSTER_Y = 0.14

const CLOUD_BIG_PATH = '/models/decorations/cloud-big.glb'
const CLOUD_SMALL_PATH = '/models/decorations/cloud-small.glb'
// Cloud geometry stays inside the hex (flat-to-flat half-width ≈ 0.866). With
// satellites pulled in to radius ~0.22 and target size 1.15, satellite edges
// land near 0.8 — fully clear of explored neighbors.
const CLOUD_TARGET_SIZE = 1.15

// Darker, more desaturated base so fog reads as a void rather than a cool-tinted
// terrain type. Pale white clouds stay bright on top — the contrast is what
// sells "unexplored" instead of "another weather tile".
const FOG_BASE_COLOR = '#252d3a'
const FOG_TOP_COLOR = '#323c4d'
const FOG_CLOUD_TINT = '#ffffff'

// Drift stays small so clouds never wander into a neighboring playable tile.
const CLUSTER_DRIFT_AMPLITUDE = 0.035

interface CloudPlacement {
	readonly path: string
	readonly x: number
	readonly y: number
	readonly z: number
	readonly scale: number
	readonly rotationY: number
	readonly phase: number
}

function generateCloudPlacements(seed: number): readonly CloudPlacement[] {
	const rand = mulberry32(seed || 1)
	// Primary dome sits low and central — fills the hex surface. Two satellites
	// straddle it on opposite sides of a randomized axis. Placement radii stay
	// well inside the hex (flat side ≈ 0.866 from center) so cloud geometry
	// never bulges over an adjacent explored tile.
	const primary: CloudPlacement = {
		path: CLOUD_BIG_PATH,
		x: (rand() - 0.5) * 0.1,
		y: 0.02 + rand() * 0.04,
		z: (rand() - 0.5) * 0.1,
		scale: 0.95 + rand() * 0.1,
		rotationY: rand() * Math.PI * 2,
		phase: rand() * Math.PI * 2
	}
	const axis = rand() * Math.PI * 2
	const satelliteRadius = 0.2 + rand() * 0.04
	const satelliteA: CloudPlacement = {
		path: CLOUD_SMALL_PATH,
		x: Math.cos(axis) * satelliteRadius,
		y: 0.16 + rand() * 0.05,
		z: Math.sin(axis) * satelliteRadius,
		scale: 0.66 + rand() * 0.1,
		rotationY: rand() * Math.PI * 2,
		phase: rand() * Math.PI * 2
	}
	const satelliteB: CloudPlacement = {
		path: CLOUD_SMALL_PATH,
		x: Math.cos(axis + Math.PI) * satelliteRadius,
		y: 0.14 + rand() * 0.05,
		z: Math.sin(axis + Math.PI) * satelliteRadius,
		scale: 0.62 + rand() * 0.1,
		rotationY: rand() * Math.PI * 2,
		phase: rand() * Math.PI * 2
	}
	return [primary, satelliteA, satelliteB]
}

interface FogCloudTileProps {
	readonly entry: Extract<BoardRenderEntry, { kind: 'fog' }>
	readonly x: number
	readonly z: number
	readonly onEntryClick?: ((entry: BoardRenderEntry) => void) | undefined
}

export function FogCloudTile({ entry, x, z, onEntryClick }: FogCloudTileProps) {
	const seed = useMemo(() => tileSeedFromWorld(x, z), [x, z])
	const placements = useMemo(() => generateCloudPlacements(seed), [seed])

	const clusterRef = useRef<Group>(null)
	const cloudRefs = useRef<Group[]>([])
	const reducedMotion = useSyncExternalStore(
		subscribeReducedMotion,
		prefersReducedMotion,
		() => true
	)

	const driftPhaseX = (seed * 0.00037) % (Math.PI * 2)
	const driftPhaseZ = (seed * 0.00091 + 1.57) % (Math.PI * 2)

	useFrame((state) => {
		if (reducedMotion) {
			return
		}
		const t = state.clock.elapsedTime
		const cluster = clusterRef.current
		if (cluster) {
			cluster.position.x =
				Math.sin(t * 0.18 + driftPhaseX) * CLUSTER_DRIFT_AMPLITUDE
			cluster.position.z =
				Math.cos(t * 0.15 + driftPhaseZ) * CLUSTER_DRIFT_AMPLITUDE
			cluster.position.y =
				FOG_CLUSTER_Y + Math.sin(t * 0.45 + seed * 0.0009) * 0.018
			cluster.rotation.y = Math.sin(t * 0.12 + seed * 0.0005) * 0.04
		}
		for (let i = 0; i < cloudRefs.current.length; i++) {
			const group = cloudRefs.current[i]
			const placement = placements[i]
			if (!group || !placement) {
				continue
			}
			const wobble = Math.sin(t * 0.55 + placement.phase) * 0.03
			group.position.y = placement.y + wobble
		}
	})

	const selectFogTile = (event: { stopPropagation: () => void }) => {
		event.stopPropagation()
		onEntryClick?.(entry)
	}

	return (
		<group position={[x, 0, z]}>
			<mesh
				position={[0, FOG_BASE_CENTER_Y, 0]}
				onClick={selectFogTile}
				receiveShadow
			>
				<cylinderGeometry
					args={hexPrismArgs(FOG_BASE_HEIGHT, FOG_BASE_RADIUS)}
				/>
				<meshStandardMaterial color={FOG_BASE_COLOR} roughness={0.95} />
			</mesh>
			<mesh
				position={[0, FOG_TOP_Y, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				onClick={selectFogTile}
				receiveShadow
			>
				<circleGeometry args={hexCircleArgs(FOG_TOP_RADIUS)} />
				<meshStandardMaterial color={FOG_TOP_COLOR} roughness={0.95} />
			</mesh>
			<group
				ref={clusterRef}
				position={[0, FOG_CLUSTER_Y, 0]}
				onClick={selectFogTile}
			>
				{placements.map((placement, i) => (
					<group
						key={`${placement.x}:${placement.z}`}
						ref={(el) => {
							if (el) {
								cloudRefs.current[i] = el
							}
						}}
						position={[placement.x, placement.y, placement.z]}
						rotation={[0, placement.rotationY, 0]}
					>
						<CloudMesh path={placement.path} scale={placement.scale} />
					</group>
				))}
			</group>
		</group>
	)
}

interface CloudMeshProps {
	readonly path: string
	readonly scale: number
}

function CloudMesh({ path, scale }: CloudMeshProps) {
	const { scene } = useGltfAsset(path)
	const template = useMemo(() => getTintedCloudTemplate(scene), [scene])
	// Shallow clone per instance — geometry and (already-tinted) materials are
	// shared, so we only pay for new Object3D wrappers. Three.js requires a
	// unique parent chain per mounted scene.
	const instanceRoot = useMemo(() => template.root.clone(true), [template])
	const fitScale =
		Number.isFinite(template.maxDim) && template.maxDim > 0
			? CLOUD_TARGET_SIZE / template.maxDim
			: 1
	const finalScale = fitScale * scale
	return (
		<group scale={[finalScale, finalScale, finalScale]}>
			<primitive object={instanceRoot} />
		</group>
	)
}

// Per-scene cache: every fog tile shares the same tint, so each cloud GLB
// only needs a single tinted+centered template.
const tintedCloudCache = new WeakMap<Object3D, CenteredScene>()

function getTintedCloudTemplate(scene: Object3D): CenteredScene {
	const cached = tintedCloudCache.get(scene)
	if (cached) {
		return cached
	}
	const cloned = scene.clone(true)
	const color = new Color(FOG_CLOUD_TINT)
	cloned.traverse((obj) => {
		if (!(obj instanceof Mesh)) {
			return
		}
		obj.castShadow = true
		obj.receiveShadow = true
		obj.material = applyCloudTint(obj.material, color)
	})
	const centered = centerObject(cloned)
	tintedCloudCache.set(scene, centered)
	return centered
}

function applyCloudTint(
	material: Material | Material[],
	color: Color
): Material | Material[] {
	if (Array.isArray(material)) {
		return material.map((m) => tintOne(m, color))
	}
	return tintOne(material, color)
}

interface TintableMaterial extends Material {
	color: Color
}

function tintOne(material: Material, color: Color): Material {
	if (!isTintable(material)) {
		return material
	}
	const cloned = material.clone()
	cloned.color = color.clone()
	return cloned
}

function isTintable(material: Material): material is TintableMaterial {
	return 'color' in material && material.color instanceof Color
}
