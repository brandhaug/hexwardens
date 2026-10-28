import { lazy, Suspense } from 'react'

const TechTreeDisplay = lazy(() =>
	import('@/components/game/tech-tree-display').then((m) => ({
		default: m.TechTreeDisplay
	}))
)

export function WikiTechTree() {
	return (
		<div className='not-prose my-6 overflow-hidden rounded-md border'>
			<Suspense
				fallback={
					<div className='flex h-[70vh] items-center justify-center text-muted-foreground text-sm'>
						Loading tech tree…
					</div>
				}
			>
				<TechTreeDisplay className='h-[70vh]' showLegend={false} />
			</Suspense>
		</div>
	)
}
