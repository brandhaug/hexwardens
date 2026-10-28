import { type Preview } from '@storybook/react-vite'
import { type ReactElement } from 'react'
import '../src/index.css'

const preview: Preview = {
	parameters: {
		layout: 'fullscreen',
		backgrounds: { disable: true }
	},
	decorators: [
		(Story): ReactElement => (
			<div className='dark h-screen w-screen bg-background'>
				<Story />
			</div>
		)
	]
}

export default preview
