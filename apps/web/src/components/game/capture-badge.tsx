import { Html } from '@react-three/drei'
import { type BoardWorldPosition } from './board-position-to-world'

interface CaptureBadgeProps {
	readonly worldPosition: BoardWorldPosition
}

export function CaptureBadge({ worldPosition }: CaptureBadgeProps) {
	return (
		<group
			position={[worldPosition[0], worldPosition[1] + 1.7, worldPosition[2]]}
		>
			<Html center distanceFactor={9} zIndexRange={[20, 0]}>
				<div
					aria-hidden='true'
					className='pointer-events-none flex size-7 items-center justify-center rounded-full font-heading font-bold text-[#4b2a0b] text-[0.9375rem] leading-none'
					style={{
						backgroundColor: '#f7b943',
						boxShadow: [
							'0 2px 0 #9d5117',
							'0 4px 10px rgba(43,26,8,0.34)',
							'inset 0 0 0 2px #fff8dc'
						].join(', ')
					}}
				>
					!
				</div>
			</Html>
		</group>
	)
}
