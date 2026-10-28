import { Html } from '@react-three/drei'
import { type CSSProperties, type ReactNode } from 'react'

const PARCHMENT_SURFACE = '#F7FBEF'
const INK_TEXT = '#2A2018'

interface HudBadgeProps {
	readonly position: [number, number, number]
	readonly distanceFactor: number
	readonly tribeColor: string
	readonly variant: 'pill' | 'plaque'
	readonly children: ReactNode
}

export function HudBadge({
	position,
	distanceFactor,
	tribeColor,
	variant,
	children
}: HudBadgeProps) {
	const style: CSSProperties = {
		backgroundColor: PARCHMENT_SURFACE,
		color: INK_TEXT,
		borderRadius: variant === 'pill' ? 9999 : 6,
		padding: variant === 'pill' ? '2px 7px' : '4px 8px',
		boxShadow: [
			`inset 0 0 0 1.25px ${tribeColor}`,
			'0 1px 0 rgba(255,255,255,0.55)',
			'0 4px 10px rgba(20,41,43,0.22)'
		].join(', ')
	}
	return (
		<Html
			position={position}
			center
			distanceFactor={distanceFactor}
			zIndexRange={[20, 0]}
		>
			<div className='pointer-events-none inline-flex' style={style}>
				{children}
			</div>
		</Html>
	)
}
