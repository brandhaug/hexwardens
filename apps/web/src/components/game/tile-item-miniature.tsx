import { Users } from 'lucide-react'
import { type SVGProps } from 'react'
import { type TileItem } from '@hexwardens/game-logic/tile/tile-item'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import {
	describeTileItemVisual,
	getVisualEntry,
	tribeToMaterialColor
} from './board-visual-registry'
import { HudBadge } from './hud-badge'
import { MeshAsset } from './mesh-asset'
import { TribeIcon } from './tribe-icon'

const TRIBE_MARKER_ROTATION: Record<Tribe, number> = {
	barbarians: 0,
	rogues: 0.7,
	druids: 1.4,
	orcs: 2.1,
	wraiths: 2.8,
	engineers: 3.5,
	templars: 4.2,
	skeletons: 4.9,
	frostkin: 5.6
}

interface TileItemMiniatureProps {
	readonly item: TileItem
	readonly topY: number
}

export function TileItemMiniature({ item, topY }: TileItemMiniatureProps) {
	const label = describeTileItemVisual(item)
	const ownerColor =
		'tribe' in item && item.tribe ? tribeToMaterialColor[item.tribe] : '#d9a54f'

	const visual = getVisualEntry(item)

	switch (visual.type) {
		case 'village': {
			const { item: village, entry, groupScale, meshScale } = visual
			return (
				<group
					position={[0, topY, 0]}
					scale={[groupScale, groupScale, groupScale]}
					aria-label={label}
				>
					<TileFootprint color={ownerColor} radius={0.38} />
					<MeshAsset
						path={entry.path}
						tintMaterial={entry.tintMaterial}
						tintColor={village.tribe ? ownerColor : undefined}
						scale={meshScale}
					/>
					{village.tribe && (
						<TribeMarker
							color={ownerColor}
							rotationY={TRIBE_MARKER_ROTATION[village.tribe]}
						/>
					)}
					<VillageBadge item={village} color={ownerColor} />
				</group>
			)
		}
		case 'building': {
			const { item: building, entry, groupScale, meshScale } = visual
			return (
				<group
					position={[0, topY, 0]}
					scale={[groupScale, groupScale, groupScale]}
					aria-label={label}
				>
					<TileFootprint color={ownerColor} radius={0.34} />
					<MeshAsset
						path={entry.path}
						tintMaterial={entry.tintMaterial}
						tintColor={building.tribe ? ownerColor : undefined}
						scale={meshScale}
					/>
				</group>
			)
		}
		case 'resource': {
			const { entry, groupScale, meshScale, placements } = visual
			return (
				<group position={[0, topY, 0]} scale={groupScale} aria-label={label}>
					{placements.map(({ position, scale, rotation }) => (
						<group
							key={position.join(':')}
							position={[...position]}
							scale={scale}
							rotation={[0, rotation, 0]}
						>
							{entry.kind === 'mesh' ? (
								<MeshAsset
									path={entry.path}
									tintMaterial={entry.tintMaterial}
									scale={meshScale}
								/>
							) : (
								entry.render({})
							)}
						</group>
					))}
				</group>
			)
		}
		case 'ruins': {
			const { entry, groupScale, meshScale } = visual
			return (
				<group
					position={[0, topY, 0]}
					scale={[groupScale, groupScale, groupScale]}
					aria-label={label}
				>
					<TileFootprint color='#6b6253' radius={0.3} />
					<MeshAsset
						path={entry.path}
						tintMaterial={entry.tintMaterial}
						scale={meshScale}
					/>
				</group>
			)
		}
		default: {
			return assertNever(visual)
		}
	}
}

const VILLAGE_MAX_LEVEL = 13

function VillageBadge({
	item,
	color
}: {
	readonly item: Extract<TileItem, { type: 'village' }>
	readonly color: string
}) {
	const atMaxLevel = item.level >= VILLAGE_MAX_LEVEL
	const segmentCount = item.experienceToNextLevel
	const filledCount = atMaxLevel
		? segmentCount
		: Math.max(0, Math.min(segmentCount, item.experience))
	const xpLabel = atMaxLevel
		? `Village at max level`
		: `Village experience ${item.experience} of ${item.experienceToNextLevel}`
	const filledColor = atMaxLevel ? '#C2410C' : '#D9A40C'
	return (
		<HudBadge
			position={[0, 0.9, 0]}
			distanceFactor={7.4}
			tribeColor={color}
			variant='plaque'
		>
			<span className='flex w-[110px] flex-col items-stretch gap-1 leading-none'>
				<span className='flex justify-between gap-2 font-heading text-[0.625rem] font-semibold'>
					<span>{item.kind === 'capital' ? 'Capital' : 'Village'}</span>
					<span aria-label={`${item.salary} gold per turn`}>
						+{item.salary}/turn
					</span>
				</span>
				<span className='flex items-center gap-1.5 whitespace-nowrap font-heading text-[0.625rem] font-semibold tabular-nums'>
					{item.tribe ? (
						<TribeIcon
							tribe={item.tribe}
							className='size-3 shrink-0'
							style={{ color }}
						/>
					) : (
						<NeutralVillageIcon className='size-3 shrink-0 opacity-65' />
					)}
					<span>Lv {item.level}</span>
					<span className='ml-auto flex items-center gap-0.5 opacity-70'>
						<Users aria-hidden='true' className='size-2.5' />
						<span>
							{item.population}/{item.maxPopulation}
						</span>
					</span>
				</span>
				<span
					className='flex h-[3px] w-full gap-[2px]'
					role='progressbar'
					aria-label={xpLabel}
					aria-valuemin={0}
					aria-valuemax={segmentCount}
					aria-valuenow={filledCount}
				>
					{Array.from({ length: segmentCount }, (_, i) => (
						<span
							key={i}
							className='block h-full flex-1 rounded-[1px] motion-safe:transition-colors motion-safe:duration-300'
							style={{
								backgroundColor:
									i < filledCount ? filledColor : 'rgba(20, 16, 8, 0.18)'
							}}
						/>
					))}
				</span>
			</span>
		</HudBadge>
	)
}

function NeutralVillageIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='currentColor'
			xmlns='http://www.w3.org/2000/svg'
			aria-hidden='true'
			focusable='false'
			{...props}
		>
			{/* Hollow banner on a pole — settlement awaiting a tribe's claim. */}
			<rect x='4.5' y='3' width='1.5' height='19' rx='0.5' />
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 6 4 L 19 4 L 19 13 L 6 13 Z M 8.5 6 L 16.5 6 L 16.5 11 L 8.5 11 Z'
			/>
		</svg>
	)
}

function TileFootprint({
	color,
	radius
}: {
	readonly color: string
	readonly radius: number
}) {
	return (
		<mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
			<circleGeometry args={[radius, 24]} />
			<meshBasicMaterial
				color={color}
				transparent
				opacity={0.22}
				depthWrite={false}
			/>
		</mesh>
	)
}

function TribeMarker({
	color,
	rotationY
}: {
	readonly color: string
	readonly rotationY: number
}) {
	return (
		<group position={[0.28, 0.04, -0.24]} rotation={[0, rotationY, 0]}>
			<mesh position={[0, 0.22, 0]}>
				<cylinderGeometry args={[0.018, 0.018, 0.44, 8]} />
				<meshStandardMaterial color='#2f3742' roughness={0.75} />
			</mesh>
			<mesh position={[0.09, 0.34, 0]} rotation={[0, 0, -0.15]}>
				<boxGeometry args={[0.18, 0.12, 0.018]} />
				<meshStandardMaterial color={color} roughness={0.68} />
			</mesh>
		</group>
	)
}
