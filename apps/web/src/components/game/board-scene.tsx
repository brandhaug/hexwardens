import { Predicate } from 'effect'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { type ReactNode, Suspense, useRef, useSyncExternalStore } from 'react'
import {
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'
import {
	ACESFilmicToneMapping,
	type Group,
	MOUSE,
	SRGBColorSpace,
	setConsoleFunction,
	TOUCH
} from 'three'
import {
	getGamePreferences,
	getServerGamePreferences,
	subscribeGamePreferences
} from '@/lib/game-preferences'

// @react-three/fiber 9.6.1 still instantiates THREE.Clock internally, which
// emits a deprecation warning since three r183. Filter that one message;
// pass everything else through.
setConsoleFunction((level, message, ...params) => {
	if (
		Predicate.isString(message) &&
		message.includes('THREE.Clock: This module has been deprecated')
	) {
		return
	}
	console[level](message, ...params)
})

export interface BoardSceneOverrides {
	readonly cameraPosition?: readonly [number, number, number]
	readonly cameraFov?: number
	readonly fogNear?: number
	readonly fogFar?: number
	readonly minDistance?: number
	readonly maxDistance?: number
}

interface BoardSceneProps {
	readonly children: ReactNode
	readonly initialTarget?: readonly [number, number, number]
	readonly overrides?: BoardSceneOverrides | undefined
}

const DEFAULT_CAMERA_POSITION: readonly [number, number, number] = [0, 6.1, 6.9]
const DEFAULT_CAMERA_FOV = 34
const MOBILE_CAMERA_FOV = 48
const DEFAULT_FOG_NEAR = 20
const DEFAULT_FOG_FAR = 52
const DEFAULT_MIN_DISTANCE = 2.6
const DEFAULT_MAX_DISTANCE = 22
const SKY_TOP_COLOR = '#bfe8f0'
const SKY_HORIZON_COLOR = '#ffe3a6'
const FOG_COLOR = '#e3f3f5'
const HEMI_GROUND_COLOR = '#c8d872'

const BASE_PAN_SPEED = 1.2
const BASE_ROTATE_SPEED = 0.9
const BASE_ZOOM_SPEED = 1.1

const MOBILE_BOARD_QUERY = '(max-width: 767px)'

function subscribeMobileBoard(listener: () => void) {
	const query = window.matchMedia(MOBILE_BOARD_QUERY)
	query.addEventListener('change', listener)
	return () => query.removeEventListener('change', listener)
}

function isMobileBoard() {
	return window.matchMedia(MOBILE_BOARD_QUERY).matches
}

function getServerMediaSnapshot() {
	return false
}

export function BoardScene({
	children,
	initialTarget,
	overrides
}: BoardSceneProps) {
	const mobile = useSyncExternalStore(
		subscribeMobileBoard,
		isMobileBoard,
		getServerMediaSnapshot
	)
	const prefs = useSyncExternalStore(
		subscribeGamePreferences,
		getGamePreferences,
		getServerGamePreferences
	)
	const cameraPosition = overrides?.cameraPosition ?? DEFAULT_CAMERA_POSITION
	const cameraFov =
		overrides?.cameraFov ?? (mobile ? MOBILE_CAMERA_FOV : DEFAULT_CAMERA_FOV)
	const fogNear = overrides?.fogNear ?? DEFAULT_FOG_NEAR
	const fogFar = overrides?.fogFar ?? DEFAULT_FOG_FAR
	const minDistance = overrides?.minDistance ?? DEFAULT_MIN_DISTANCE
	const maxDistance = overrides?.maxDistance ?? DEFAULT_MAX_DISTANCE
	// Callers must pass a memoized `initialTarget`. OrbitControls owns
	// `target` after mount; a fresh array reference yanks the camera back
	// on every selection change.
	const target = initialTarget ?? [0, 0, 0]
	const resolvedCameraPosition: readonly [number, number, number] = [
		target[0] + cameraPosition[0],
		target[1] + cameraPosition[1],
		target[2] + cameraPosition[2]
	]
	return (
		<div
			data-game-canvas
			className='relative h-full w-full select-none overflow-hidden [&_canvas]:!touch-none'
			onContextMenu={(event) => event.preventDefault()}
			style={{
				background: `linear-gradient(180deg, ${SKY_TOP_COLOR} 0%, ${SKY_TOP_COLOR} 35%, ${SKY_HORIZON_COLOR} 100%)`,
				/* The board owns every gesture: pinch-zoom dollies the camera, drag
				   pans the world, double-tap doesn't escape. overscrollBehavior:none
				   stops a swipe-down from triggering a browser pull-to-refresh on
				   mobile, even outside the immersive shell. */
				touchAction: 'none',
				overscrollBehavior: 'none',
				WebkitUserSelect: 'none',
				userSelect: 'none',
				WebkitTouchCallout: 'none'
			}}
		>
			<Canvas
				shadows='percentage'
				dpr={[1, mobile ? 1.5 : 2]}
				camera={{
					position: [
						resolvedCameraPosition[0],
						resolvedCameraPosition[1],
						resolvedCameraPosition[2]
					],
					fov: cameraFov,
					near: 0.1,
					far: 100
				}}
				gl={{
					antialias: true,
					powerPreference: 'high-performance',
					preserveDrawingBuffer: false,
					alpha: true
				}}
				onCreated={({ gl }) => {
					gl.outputColorSpace = SRGBColorSpace
					gl.toneMapping = ACESFilmicToneMapping
					gl.toneMappingExposure = 1.18
				}}
			>
				<fog attach='fog' args={[FOG_COLOR, fogNear, fogFar]} />
				<hemisphereLight args={[SKY_TOP_COLOR, HEMI_GROUND_COLOR, 0.92]} />
				<ambientLight intensity={0.58} />
				<directionalLight
					key={mobile ? 'mobile-shadow' : 'desktop-shadow'}
					position={[4.5, 8.5, 3.2]}
					intensity={2.45}
					castShadow
					shadow-mapSize-width={mobile ? 1024 : 2048}
					shadow-mapSize-height={mobile ? 1024 : 2048}
				/>
				<directionalLight position={[-5, 4, -5]} intensity={0.48} />
				<ContactShadows
					position={[0, -0.05, 0]}
					opacity={0.32}
					scale={32}
					blur={2.8}
					far={10}
					resolution={mobile ? 512 : 1024}
					color='#39536a'
				/>
				<DriftingClouds />
				<Suspense fallback={null}>{children}</Suspense>
				<OrbitControls
					makeDefault
					enableDamping
					dampingFactor={0.08}
					enablePan
					enableRotate
					enableZoom
					screenSpacePanning={false}
					panSpeed={BASE_PAN_SPEED * prefs.cameraSpeed}
					rotateSpeed={BASE_ROTATE_SPEED * prefs.cameraSpeed}
					zoomSpeed={BASE_ZOOM_SPEED * prefs.cameraSpeed}
					minDistance={minDistance}
					maxDistance={maxDistance}
					minPolarAngle={0.35}
					maxPolarAngle={1.25}
					mouseButtons={{
						LEFT: MOUSE.PAN,
						MIDDLE: MOUSE.DOLLY,
						RIGHT: MOUSE.ROTATE
					}}
					touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }}
					target={[target[0], target[1], target[2]]}
				/>
			</Canvas>
		</div>
	)
}

interface CloudPuff {
	readonly x: number
	readonly y: number
	readonly z: number
	readonly radius: number
}

interface CloudInstance {
	readonly id: number
	readonly speed: number
	readonly initialX: number
	readonly z: number
	readonly y: number
	readonly scale: number
	readonly puffs: readonly CloudPuff[]
}

const CLOUD_DRIFT_RANGE = 18
const CLOUDS: readonly CloudInstance[] = [
	{
		id: 0,
		speed: 0.18,
		initialX: -6,
		z: -10,
		y: 3.2,
		scale: 0.7,
		puffs: [
			{ x: 0, y: 0, z: 0, radius: 1.1 },
			{ x: 1, y: 0.1, z: 0, radius: 0.85 },
			{ x: -0.95, y: -0.05, z: 0, radius: 0.8 },
			{ x: 0.3, y: 0.45, z: 0, radius: 0.6 }
		]
	},
	{
		id: 1,
		speed: 0.12,
		initialX: 3,
		z: -13,
		y: 4.1,
		scale: 0.85,
		puffs: [
			{ x: 0, y: 0, z: 0, radius: 1.25 },
			{ x: 1.3, y: 0.08, z: 0, radius: 0.95 },
			{ x: -1.2, y: 0.05, z: 0, radius: 0.9 },
			{ x: 0.25, y: 0.55, z: 0, radius: 0.7 }
		]
	},
	{
		id: 2,
		speed: 0.24,
		initialX: 9,
		z: -8,
		y: 2.6,
		scale: 0.55,
		puffs: [
			{ x: 0, y: 0, z: 0, radius: 0.9 },
			{ x: 0.85, y: 0.05, z: 0, radius: 0.7 },
			{ x: -0.8, y: -0.05, z: 0, radius: 0.65 }
		]
	},
	{
		id: 3,
		speed: 0.16,
		initialX: -2,
		z: -16,
		y: 5,
		scale: 0.95,
		puffs: [
			{ x: 0, y: 0, z: 0, radius: 1.35 },
			{ x: 1.4, y: 0.08, z: 0, radius: 1 },
			{ x: -1.3, y: 0.05, z: 0, radius: 0.95 },
			{ x: 0.5, y: 0.6, z: 0, radius: 0.7 }
		]
	}
]

function DriftingClouds() {
	return (
		<group renderOrder={-1}>
			{CLOUDS.map((cloud) => (
				<DriftingCloud key={cloud.id} cloud={cloud} />
			))}
		</group>
	)
}

function DriftingCloud({ cloud }: { readonly cloud: CloudInstance }) {
	const groupRef = useRef<Group>(null)
	const reducedMotion = useSyncExternalStore(
		subscribeReducedMotion,
		prefersReducedMotion,
		getServerMediaSnapshot
	)
	useFrame((state) => {
		const group = groupRef.current
		if (!group || reducedMotion) {
			return
		}
		const drift =
			((state.clock.elapsedTime * cloud.speed +
				cloud.initialX +
				CLOUD_DRIFT_RANGE) %
				(CLOUD_DRIFT_RANGE * 2)) -
			CLOUD_DRIFT_RANGE
		group.position.x = drift
		group.position.y = cloud.y
		group.position.z = cloud.z
	})
	return (
		<group
			ref={groupRef}
			position={[cloud.initialX, cloud.y, cloud.z]}
			scale={[cloud.scale, cloud.scale, cloud.scale]}
		>
			{cloud.puffs.map((puff) => (
				<mesh
					key={`${puff.x}:${puff.y}:${puff.z}`}
					position={[puff.x, puff.y, puff.z]}
					frustumCulled={false}
				>
					<sphereGeometry args={[puff.radius, 12, 10]} />
					<meshBasicMaterial
						color='#ffffff'
						transparent
						opacity={0.78}
						depthWrite={false}
						fog={false}
					/>
				</mesh>
			))}
		</group>
	)
}
