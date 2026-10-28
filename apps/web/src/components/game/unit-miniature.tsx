import {
	AUTO_SCALE_TARGET_SIZE,
	MESH_VISUAL_SCALE_MULTIPLIER
} from './mesh-scale'
import { useFrame } from '@react-three/fiber'
import {
	Suspense,
	useEffect,
	useMemo,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode
} from 'react'
import { Color, type Group, MeshBasicMaterial, RingGeometry } from 'three'
import { useGltfAssets } from './gltf-loader'
import { cloneMeshScene } from './clone-mesh-scene'
import {
	getUnitDisplayName,
	type Unit
} from '@hexwardens/game-logic/domains/unit'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import { HudBadge } from './hud-badge'
import {
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'
import { type BoardWorldPosition } from './board-position-to-world'
import { getVisualEntry, tribeToMaterialColor } from './board-visual-registry'
import { type UnitMoveAnimation } from './board-animations'
import { TribeIcon } from './tribe-icon'
import { MeshAsset, MeshAssetErrorBoundary } from './mesh-asset'
import { UnitCombatBody } from './unit-combat-body'
import { UNIT_MOVE_TWEEN_DURATION_MS, unitMoveTween } from './unit-move-tween'
import {
	rigAnimationLibraries,
	type UnitAnimationState
} from './animation-clips'
import {
	useUnitAnimationMixer,
	type UnitAnimationSets
} from './unit-animation-mixer'
import {
	type AssetRig,
	type EquipmentSlot,
	type MeshAssetEntry
} from './visual-registry-types'

const EQUIPMENT_BONE_BY_SLOT: Record<EquipmentSlot, string> = {
	rightHand: 'handslotr',
	leftHand: 'handslotl'
}

const EQUIPMENT_SLOTS = [
	'rightHand',
	'leftHand'
] as const satisfies readonly EquipmentSlot[]

const RIG_AUTO_SCALE_BOOST: Record<AssetRig, number> = {
	Rig_Medium: 1,
	Rig_Large: 1.4
}

const ACTION_RING_GEOMETRY = new RingGeometry(0.28, 0.36, 36)
const ACTION_RING_MATERIAL = new MeshBasicMaterial({
	color: new Color('#f7b943'),
	transparent: true,
	opacity: 0.85,
	depthWrite: false
})

interface UnitMiniatureProps {
	readonly unit: Unit
	readonly terrain: TileTerrain
	readonly health: number
	readonly maxHealth: number
	readonly worldPosition: BoardWorldPosition
	readonly topY: number
	readonly moveAnimation?: UnitMoveAnimation | undefined
	readonly animationOverride?: UnitAnimationOverride | undefined
	readonly showHud?: boolean
	/**
	 * True when this unit still has a move or attack available this turn.
	 * Renders a gold ring under the miniature so players can see at a glance
	 * which of their units are ready to act.
	 */
	readonly hasAction?: boolean
}

export function UnitMiniature({
	unit,
	terrain,
	health,
	maxHealth,
	worldPosition,
	topY,
	moveAnimation,
	animationOverride,
	showHud = true,
	hasAction = false
}: UnitMiniatureProps) {
	const tribeColor = tribeToMaterialColor[unit.tribe]
	const label = getUnitDisplayName(unit.type)
	const reducedMotion = useReducedMotion()
	const animationState =
		animationOverride?.state ??
		(moveAnimation && !reducedMotion ? 'walk' : 'idle')
	const showHealth = showHud && health > 0

	return (
		<AnimatedUnit
			worldPosition={worldPosition}
			topY={topY}
			moveAnimation={moveAnimation}
			reducedMotion={reducedMotion}
		>
			<mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<circleGeometry args={[0.25, 24]} />
				<meshBasicMaterial
					color={tribeColor}
					transparent
					opacity={0.6}
					depthWrite={false}
				/>
			</mesh>
			{hasAction && (
				<mesh
					position={[0, 0.014, 0]}
					rotation={[-Math.PI / 2, 0, 0]}
					geometry={ACTION_RING_GEOMETRY}
					material={ACTION_RING_MATERIAL}
				/>
			)}
			<group scale={[1.22, 1.22, 1.22]}>
				<UnitCombatBody
					animation={animationOverride}
					reducedMotion={reducedMotion}
				>
					<UnitVisual
						unit={unit}
						terrain={terrain}
						tribeColor={tribeColor}
						animationState={animationState}
						animationToken={animationOverride?.token ?? 0}
						reducedMotion={reducedMotion}
					/>
				</UnitCombatBody>
			</group>
			{showHealth && (
				<HudBadge
					position={[0, 1.44, 0]}
					distanceFactor={9}
					tribeColor={tribeColor}
					variant='pill'
				>
					<span className='flex items-center gap-1'>
						<TribeIcon tribe={unit.tribe} className='size-3' />
						<span className='font-heading text-[0.6875rem] font-semibold leading-none tabular-nums'>
							{health}
						</span>
					</span>
					<span className='sr-only'>
						{label} health {health} of {maxHealth}
					</span>
				</HudBadge>
			)}
		</AnimatedUnit>
	)
}

export interface UnitAnimationOverride {
	readonly state: Extract<UnitAnimationState, 'attack' | 'defend' | 'death'>
	readonly token: number
}

interface UnitVisualProps {
	readonly unit: Unit
	readonly terrain: TileTerrain
	readonly tribeColor: string
	readonly animationState: UnitAnimationState
	readonly animationToken: number
	readonly reducedMotion: boolean
}

function UnitVisual({
	unit,
	terrain,
	tribeColor,
	animationState,
	animationToken,
	reducedMotion
}: UnitVisualProps) {
	// Selection (water → ship fallback, hero-vs-general registry, tint,
	// hero scale boost) lives in the `getVisualEntry` dispatcher; this
	// component only owns the mesh-vs-procedural JSX.
	const visual = getVisualEntry({ type: 'unit', unit, terrain })
	if (visual.entry.kind !== 'mesh') {
		return <>{visual.entry.render({ tribeColor })}</>
	}
	return (
		<group scale={[visual.groupScale, visual.groupScale, visual.groupScale]}>
			<UnitMeshAsset
				entry={visual.entry}
				tintColor={visual.tintColor}
				animationState={animationState}
				animationToken={animationToken}
				reducedMotion={reducedMotion}
			/>
		</group>
	)
}

function UnitMeshAsset({
	entry,
	tintColor,
	animationState,
	animationToken,
	reducedMotion
}: {
	readonly entry: MeshAssetEntry
	readonly tintColor?: string | undefined
	readonly animationState: UnitAnimationState
	readonly animationToken: number
	readonly reducedMotion: boolean
}) {
	if (!entry.rig) {
		return (
			<MeshAsset
				path={entry.path}
				tintMaterial={entry.tintMaterial}
				tintColor={tintColor}
				scale={entry.scale}
			/>
		)
	}
	return (
		<MeshAssetErrorBoundary key={entry.path} path={entry.path}>
			<Suspense fallback={null}>
				<AnimatedMeshAsset
					entry={entry}
					rig={entry.rig}
					tintColor={tintColor}
					animationState={animationState}
					animationToken={animationToken}
					reducedMotion={reducedMotion}
				/>
			</Suspense>
		</MeshAssetErrorBoundary>
	)
}

export function AnimatedMeshAsset({
	entry,
	rig,
	tintColor,
	animationState,
	animationToken,
	reducedMotion
}: {
	readonly entry: MeshAssetEntry
	readonly rig: AssetRig
	readonly tintColor?: string | undefined
	readonly animationState: UnitAnimationState
	readonly animationToken: number
	readonly reducedMotion: boolean
}) {
	const libraries = rigAnimationLibraries[rig]
	const equipmentSlots = useMemo(
		() =>
			EQUIPMENT_SLOTS.flatMap((slot) => {
				const attachment = entry.equipment?.[slot]
				return attachment ? [{ slot, path: attachment.path }] : []
			}),
		[entry.equipment]
	)
	const paths = useMemo(
		() => [
			entry.path,
			libraries.general,
			libraries.movement,
			libraries.combat,
			...equipmentSlots.map((e) => e.path)
		],
		[
			entry.path,
			libraries.combat,
			libraries.general,
			libraries.movement,
			equipmentSlots
		]
	)
	const assets = useGltfAssets(paths)
	const [model, general, movement, combat] = assets
	if (!model || !general || !movement || !combat) {
		// oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- React must route missing loader assets through the surrounding error boundary.
		throw new Error(`Missing rig assets for ${entry.path}`)
	}
	// Slice the equipment tail once per stable `assets` reference so the
	// `object` memo below sees a stable input — otherwise the rig gets
	// rebuilt every render and the AnimationMixer restarts (idle flicker).
	const equipmentAssets = useMemo(() => assets.slice(4), [assets])
	const object = useMemo(() => {
		const centered = cloneMeshScene(model.scene, tintColor, entry.tintMaterial)
		equipmentSlots.forEach((slot, index) => {
			const asset = equipmentAssets[index]
			if (!asset) {
				return
			}
			const bone = centered.root.getObjectByName(
				EQUIPMENT_BONE_BY_SLOT[slot.slot]
			)
			if (!bone) {
				return
			}
			bone.add(asset.scene.clone(true))
		})
		return centered
	}, [entry.tintMaterial, equipmentAssets, equipmentSlots, model, tintColor])
	useEffect(() => object.dispose, [object])
	const animationSets = useMemo<UnitAnimationSets>(
		() => ({
			general: general.animations,
			movement: movement.animations,
			combat: combat.animations
		}),
		[combat.animations, general.animations, movement.animations]
	)

	useUnitAnimationMixer({
		rig,
		state: animationState,
		token: animationToken,
		reducedMotion,
		animationSets,
		root: object.root
	})

	const baseScale =
		entry.scale ??
		(AUTO_SCALE_TARGET_SIZE / object.maxDim) * RIG_AUTO_SCALE_BOOST[rig]
	const scale = baseScale * MESH_VISUAL_SCALE_MULTIPLIER
	return (
		<group scale={[scale, scale, scale]}>
			<primitive object={object.root} />
		</group>
	)
}

interface AnimatedUnitProps {
	readonly worldPosition: BoardWorldPosition
	readonly topY: number
	readonly moveAnimation?: UnitMoveAnimation | undefined
	readonly children: ReactNode
	readonly reducedMotion: boolean
}

function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState<boolean>(prefersReducedMotion)
	useEffect(() => subscribeReducedMotion(setReduced), [])
	return reduced
}

function AnimatedUnit({
	worldPosition,
	topY,
	moveAnimation,
	reducedMotion,
	children
}: AnimatedUnitProps) {
	const groupRef = useRef<Group>(null)
	const facingYRef = useRef(0)
	const activeMoveRef = useRef<UnitMoveAnimation | undefined>(undefined)
	const fromRef = useRef<BoardWorldPosition>(worldPosition)
	useLayoutEffect(() => {
		const group = groupRef.current
		if (!group) {
			return
		}
		if (moveAnimation && !reducedMotion) {
			if (activeMoveRef.current !== moveAnimation) {
				// Continue from the displayed position when another move interrupts.
				fromRef.current = [group.position.x, group.position.y, group.position.z]
			}
		}
		activeMoveRef.current = moveAnimation
	}, [moveAnimation, reducedMotion])
	useFrame((_, delta) => {
		const group = groupRef.current
		if (!group) {
			return
		}
		if (moveAnimation) {
			const elapsed = performance.now() - moveAnimation.startedAt
			const t = elapsed / UNIT_MOVE_TWEEN_DURATION_MS
			const [wx, wy, wz] = unitMoveTween(
				fromRef.current,
				[worldPosition[0], topY + worldPosition[1], worldPosition[2]],
				t,
				reducedMotion
			)
			group.position.x = wx
			group.position.y = wy
			group.position.z = wz
			const dx = moveAnimation.toWorld[0] - moveAnimation.fromWorld[0]
			const dz = moveAnimation.toWorld[2] - moveAnimation.fromWorld[2]
			if (dx !== 0 || dz !== 0) {
				const target = Math.atan2(dx, dz)
				const difference = Math.atan2(
					Math.sin(target - facingYRef.current),
					Math.cos(target - facingYRef.current)
				)
				facingYRef.current = reducedMotion
					? target
					: facingYRef.current + difference * (1 - Math.exp(-24 * delta))
			}
			group.rotation.y = facingYRef.current
			return
		}
		const [wx, wy, wz] = worldPosition
		group.position.x = wx
		group.position.y = topY + wy
		group.position.z = wz
		group.rotation.y = facingYRef.current
	})
	return <group ref={groupRef}>{children}</group>
}
