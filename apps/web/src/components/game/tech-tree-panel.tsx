import { lazy, Suspense } from 'react'

import { type TechTreePanelProps } from './tech-tree-panel-inner'
export type { TechTreePanelProps }

const TechTreePanelInner = lazy(() => import('./tech-tree-panel-inner'))

export function TechTreePanel(props: TechTreePanelProps) {
	if (!props.isOpen) {
		return null
	}

	return (
		<Suspense
			fallback={
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80'>
					<output aria-live='polite' className='text-white'>
						Loading tech tree…
					</output>
				</div>
			}
		>
			<TechTreePanelInner {...props} />
		</Suspense>
	)
}
