import { type Meta, type StoryObj } from '@storybook/react-vite'
import { tribes, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { tribeToMaterialColor } from './board-visual-registry'
import { TribeIcon } from './tribe-icon'

const PARCHMENT = '#F7FBEF'
const INK = '#2A2018'

function Sheet({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				background:
					'radial-gradient(circle at 30% 20%, #1f5663 0%, #0a3c4b 50%, #061f29 100%)',
				color: PARCHMENT,
				minHeight: '100vh',
				padding: '48px 32px',
				fontFamily: '"Crimson Pro Variable", Georgia, serif'
			}}
		>
			{children}
		</div>
	)
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				fontFamily: '"Cinzel Variable", Georgia, serif',
				fontSize: 14,
				letterSpacing: '0.18em',
				textTransform: 'uppercase',
				color: '#F7B943',
				marginBottom: 16
			}}
		>
			{children}
		</div>
	)
}

function IconPlate({ tribe }: { tribe: Tribe }) {
	const color = tribeToMaterialColor[tribe]
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 10
			}}
		>
			<div
				style={{
					width: 96,
					height: 96,
					display: 'grid',
					placeItems: 'center',
					borderRadius: 12,
					backgroundColor: color,
					color: PARCHMENT,
					boxShadow:
						'inset 0 -3px 0 rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px rgba(0,0,0,0.35)'
				}}
			>
				<TribeIcon tribe={tribe} style={{ width: 52, height: 52 }} />
			</div>
			<div
				style={{
					fontFamily: '"Cinzel Variable", Georgia, serif',
					fontSize: 11,
					letterSpacing: '0.16em',
					textTransform: 'uppercase'
				}}
			>
				{tribe}
			</div>
		</div>
	)
}

function HudPreview({ tribe }: { tribe: Tribe }) {
	const color = tribeToMaterialColor[tribe]
	return (
		<div
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 6,
				padding: '3px 8px',
				borderRadius: 999,
				backgroundColor: PARCHMENT,
				color: INK,
				boxShadow: [
					`inset 0 0 0 1.25px ${color}`,
					'0 1px 0 rgba(255,255,255,0.55)',
					'0 4px 10px rgba(20,41,43,0.25)'
				].join(', ')
			}}
		>
			<TribeIcon tribe={tribe} style={{ width: 12, height: 12 }} />
			<span
				style={{
					fontFamily: '"Cinzel Variable", Georgia, serif',
					fontSize: 11,
					fontWeight: 600
				}}
			>
				8
			</span>
		</div>
	)
}

function Gallery() {
	return (
		<Sheet>
			<div style={{ maxWidth: 920, margin: '0 auto' }}>
				<h1
					style={{
						fontFamily: '"Cinzel Variable", Georgia, serif',
						fontSize: 36,
						margin: '0 0 8px',
						letterSpacing: '0.01em'
					}}
				>
					Tribe sigils
				</h1>
				<p
					style={{
						maxWidth: 560,
						margin: '0 0 40px',
						color: 'rgba(247, 251, 239, 0.7)',
						fontSize: 16,
						lineHeight: 1.55
					}}
				>
					Nine tribal marks, drawn as heraldic silhouettes. Each is a single
					path system in `currentColor`, so the same SVG inks dark on parchment
					and bright on the tribe&apos;s saturated identity hue.
				</p>

				<SectionTitle>Faction plates</SectionTitle>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
						gap: 24,
						marginBottom: 56
					}}
				>
					{tribes.map((tribe) => (
						<IconPlate key={tribe} tribe={tribe} />
					))}
				</div>

				<SectionTitle>Unit HUD badge</SectionTitle>
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: 14,
						marginBottom: 56
					}}
				>
					{tribes.map((tribe) => (
						<HudPreview key={tribe} tribe={tribe} />
					))}
				</div>

				<SectionTitle>Inked on parchment</SectionTitle>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
						gap: 16,
						padding: '24px 28px',
						backgroundColor: PARCHMENT,
						color: INK,
						borderRadius: 8,
						boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
					}}
				>
					{tribes.map((tribe) => (
						<div
							key={tribe}
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								gap: 6
							}}
						>
							<TribeIcon tribe={tribe} style={{ width: 36, height: 36 }} />
							<span
								style={{
									fontFamily: '"Cinzel Variable", Georgia, serif',
									fontSize: 9,
									letterSpacing: '0.14em',
									textTransform: 'uppercase'
								}}
							>
								{tribe}
							</span>
						</div>
					))}
				</div>
			</div>
		</Sheet>
	)
}

const meta = {
	title: 'Game/TribeIcon',
	component: Gallery,
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Gallery>

export default meta
type Story = StoryObj<typeof meta>

export const Sigils: Story = {}
