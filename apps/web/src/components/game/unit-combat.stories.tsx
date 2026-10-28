import { type Meta, type StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { createTestUnit } from '@hexwardens/game-logic/test/game-test-helpers'
import { Button } from '@/components/ui/button'
import { BoardScene } from './board-scene'
import { UnitMiniature } from './unit-miniature'
import { type CombatAnimationState } from './unit-animation-timing'

const CLIPS: readonly CombatAnimationState[] = ['attack', 'defend', 'death']
const UNIT = createTestUnit('barbarians', 'caveman', 'unit_combat-preview')

function CombatClips() {
	const [token, setToken] = useState(0)
	return (
		<div className='flex h-screen flex-col bg-background text-foreground'>
			<div className='flex items-center justify-between gap-4 p-4'>
				<p>Attack · Defence · Defeat</p>
				<Button onClick={() => setToken((value) => value + 1)}>
					Replay clips
				</Button>
			</div>
			<div className='min-h-0 flex-1'>
				<BoardScene
					overrides={{ cameraPosition: [0, 3.8, 5.8], cameraFov: 40 }}
				>
					{CLIPS.map((state, index) => (
						<UnitMiniature
							key={state}
							unit={UNIT}
							terrain='grass'
							health={state === 'death' ? 0 : 20}
							maxHealth={20}
							worldPosition={[(index - 1) * 1.6, 0, 0]}
							topY={0}
							animationOverride={{ state, token }}
						/>
					))}
				</BoardScene>
			</div>
		</div>
	)
}

const meta = {
	title: 'Game/Combat clips',
	component: CombatClips,
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof CombatClips>

export default meta
type Story = StoryObj<typeof meta>
export const Preview: Story = {}
