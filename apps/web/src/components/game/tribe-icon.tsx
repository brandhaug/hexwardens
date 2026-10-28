import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type ComponentType, type SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const BASE_PROPS = {
	viewBox: '0 0 24 24',
	fill: 'currentColor',
	xmlns: 'http://www.w3.org/2000/svg',
	focusable: false,
	'aria-hidden': true
} as const

function BarbariansIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Two crossed war axes, compact blades hugging the handles. */}
			<g transform='rotate(-45 12 12)'>
				<rect x='11.25' y='3.5' width='1.5' height='17' rx='0.5' />
				<path d='M 11.25 2 L 11.25 7 L 8.75 7 C 7 7 6.5 4.75 7.75 3 C 8.5 2 10 2 11.25 2 Z' />
			</g>
			<g transform='rotate(45 12 12)'>
				<rect x='11.25' y='3.5' width='1.5' height='17' rx='0.5' />
				<path d='M 12.75 2 L 12.75 7 L 15.25 7 C 17 7 17.5 4.75 16.25 3 C 15.5 2 14 2 12.75 2 Z' />
			</g>
		</svg>
	)
}

function RoguesIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Bandit mask with two eye slits, bottom dips at the bridge of the nose. */}
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 3 9 C 3 7.5 4 6.5 5.5 6.5 L 18.5 6.5 C 20 6.5 21 7.5 21 9 L 21 13.5 C 21 15.5 19.5 16.75 17.5 16.75 L 14.75 16.75 L 12 14.5 L 9.25 16.75 L 6.5 16.75 C 4.5 16.75 3 15.5 3 13.5 Z M 6.5 10.25 L 10.5 10.25 L 10.5 12.75 L 6.5 12.75 Z M 13.5 10.25 L 17.5 10.25 L 17.5 12.75 L 13.5 12.75 Z'
			/>
		</svg>
	)
}

function DruidsIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Pointed leaf with a midrib cut-out and a stem. */}
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 12 2 C 7 5 4.5 10 5.75 14.5 C 7 18.5 10 20 12 21 C 14 20 17 18.5 18.25 14.5 C 19.5 10 17 5 12 2 Z M 11.5 7.5 L 11.5 18 L 12.5 18 L 12.5 7.5 Z'
			/>
			<rect x='11' y='18.5' width='2' height='3.5' rx='0.5' />
		</svg>
	)
}

function OrcsIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			<rect x='3' y='5' width='18' height='3' rx='0.5' />
			<path d='M 5.5 8 L 10.5 8 L 8 19 Z' />
			<path d='M 13.5 8 L 18.5 8 L 16 19 Z' />
		</svg>
	)
}

function WraithsIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Closed great helm with a vertical visor slit and a horizontal eye slit. */}
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 6 3 C 5 3 4.5 3.5 4.5 4.5 L 4.5 16 C 4.5 19 7 21 12 21 C 17 21 19.5 19 19.5 16 L 19.5 4.5 C 19.5 3.5 19 3 18 3 Z M 11.25 7 L 12.75 7 L 12.75 13 L 11.25 13 Z M 7.5 9.5 L 16.5 9.5 L 16.5 11 L 7.5 11 Z'
			/>
		</svg>
	)
}

function EngineersIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Gear with eight teeth and a central bore. */}
			<rect x='11' y='1' width='2' height='4' rx='0.4' />
			<rect x='11' y='19' width='2' height='4' rx='0.4' />
			<rect x='1' y='11' width='4' height='2' rx='0.4' />
			<rect x='19' y='11' width='4' height='2' rx='0.4' />
			<rect
				x='11'
				y='1'
				width='2'
				height='4'
				rx='0.4'
				transform='rotate(45 12 12)'
			/>
			<rect
				x='11'
				y='1'
				width='2'
				height='4'
				rx='0.4'
				transform='rotate(-45 12 12)'
			/>
			<rect
				x='11'
				y='19'
				width='2'
				height='4'
				rx='0.4'
				transform='rotate(45 12 12)'
			/>
			<rect
				x='11'
				y='19'
				width='2'
				height='4'
				rx='0.4'
				transform='rotate(-45 12 12)'
			/>
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z M 12 8.5 A 3.5 3.5 0 1 0 12 15.5 A 3.5 3.5 0 1 0 12 8.5 Z'
			/>
		</svg>
	)
}

function TemplarsIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Heater shield with a Latin cross cut out through the centre. */}
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 5 3 L 19 3 L 19 12 C 19 17 15.5 20.25 12 21.5 C 8.5 20.25 5 17 5 12 Z M 11 6 L 13 6 L 13 9.5 L 16 9.5 L 16 11.5 L 13 11.5 L 13 17.5 L 11 17.5 L 11 11.5 L 8 11.5 L 8 9.5 L 11 9.5 Z'
			/>
		</svg>
	)
}

function SkeletonsIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Skull with two eye sockets, a triangular nasal cavity, and three jaw teeth. */}
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M 4 11 C 4 5 20 5 20 11 L 20 14 C 20 16 18.5 17 17 17 L 17 19.5 L 15 19.5 L 15 18 L 13 18 L 13 19.5 L 11 19.5 L 11 18 L 9 18 L 9 19.5 L 7 19.5 L 7 17 C 5.5 17 4 16 4 14 Z M 9.25 11 A 1.75 1.75 0 1 0 9.26 11 Z M 14.75 11 A 1.75 1.75 0 1 0 14.76 11 Z M 11 14.25 L 13 14.25 L 12 16.25 Z'
			/>
		</svg>
	)
}

function FrostkinIcon(props: IconProps) {
	return (
		<svg {...BASE_PROPS} {...props}>
			{/* Six-armed snowflake — three crossed beams with chevron tips on every end. */}
			<rect x='11' y='2' width='2' height='20' rx='0.5' />
			<rect
				x='11'
				y='2'
				width='2'
				height='20'
				rx='0.5'
				transform='rotate(60 12 12)'
			/>
			<rect
				x='11'
				y='2'
				width='2'
				height='20'
				rx='0.5'
				transform='rotate(120 12 12)'
			/>
			<g>
				<path d='M 12 4.5 L 14.5 7 L 13.5 8 L 12 6.5 L 10.5 8 L 9.5 7 Z' />
				<path d='M 12 19.5 L 14.5 17 L 13.5 16 L 12 17.5 L 10.5 16 L 9.5 17 Z' />
			</g>
			<g transform='rotate(60 12 12)'>
				<path d='M 12 4.5 L 14.5 7 L 13.5 8 L 12 6.5 L 10.5 8 L 9.5 7 Z' />
				<path d='M 12 19.5 L 14.5 17 L 13.5 16 L 12 17.5 L 10.5 16 L 9.5 17 Z' />
			</g>
			<g transform='rotate(120 12 12)'>
				<path d='M 12 4.5 L 14.5 7 L 13.5 8 L 12 6.5 L 10.5 8 L 9.5 7 Z' />
				<path d='M 12 19.5 L 14.5 17 L 13.5 16 L 12 17.5 L 10.5 16 L 9.5 17 Z' />
			</g>
		</svg>
	)
}

const tribeIcons: Record<Tribe, ComponentType<IconProps>> = {
	barbarians: BarbariansIcon,
	rogues: RoguesIcon,
	druids: DruidsIcon,
	orcs: OrcsIcon,
	wraiths: WraithsIcon,
	engineers: EngineersIcon,
	templars: TemplarsIcon,
	skeletons: SkeletonsIcon,
	frostkin: FrostkinIcon
}

type TribeIconProps = IconProps & { tribe: Tribe }

export function TribeIcon({ tribe, ...rest }: TribeIconProps) {
	const Component = tribeIcons[tribe]
	return <Component {...rest} />
}
