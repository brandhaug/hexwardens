import { type Meta, type StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { tribes, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { TribeBanner } from './tribe-banner'

function Gallery() {
	const [selected, setSelected] = useState<Tribe>('barbarians')
	return (
		<div
			style={{
				background:
					'radial-gradient(circle at 30% 20%, #1f5663 0%, #0a3c4b 50%, #061f29 100%)',
				color: '#F7FBEF',
				minHeight: '100vh',
				padding: '48px 32px',
				fontFamily: '"Crimson Pro Variable", Georgia, serif'
			}}
		>
			<div style={{ maxWidth: 720, margin: '0 auto' }}>
				<h1
					style={{
						fontFamily: '"Cinzel Variable", Georgia, serif',
						fontSize: 30,
						margin: '0 0 8px',
						letterSpacing: '0.01em'
					}}
				>
					Choose your tribe
				</h1>
				<p
					style={{
						margin: '0 0 32px',
						color: 'rgba(247, 251, 239, 0.7)',
						fontSize: 16
					}}
				>
					Claim a banner. Each tribe carries a saturated identity hue and a
					heraldic sigil.
				</p>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
						gap: 10
					}}
				>
					{tribes.map((tribe) => (
						<TribeBanner
							key={tribe}
							tribe={tribe}
							selected={selected === tribe}
							disabled={false}
							suggested={tribe === 'templars'}
							onSelect={() => setSelected(tribe)}
						/>
					))}
				</div>
			</div>
		</div>
	)
}

const meta = {
	title: 'Lobby/TribeBanner',
	component: Gallery,
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Gallery>

export default meta
type Story = StoryObj<typeof meta>

export const Picker: Story = {}
