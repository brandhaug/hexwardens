import { createFileRoute, Link } from '@tanstack/react-router'
import {
	primaryBuildingVisualRegistry,
	secondaryBuildingVisualRegistry,
	utilityBuildingVisualRegistry
} from '@/components/game/building-visual-registry'
import { heroVisualRegistry } from '@/components/game/hero-visual-registry'
import { resourceVisualRegistry } from '@/components/game/resource-visual-registry'
import { ruinsVisualRegistry } from '@/components/game/ruins-visual-registry'
import { unitVisualRegistry } from '@/components/game/unit-visual-registry'
import { villageVisualRegistry } from '@/components/game/village-visual-registry'
import {
	type MeshAssetEntry,
	type VisualRegistryEntry
} from '@/components/game/visual-registry-types'

export const Route = createFileRoute('/credits')({
	component: CreditsPage
})

function CreditsPage() {
	const sections: ReadonlyArray<{ title: string; attributions: string[] }> = [
		{
			title: 'Villages',
			attributions: collectAttributions(villageVisualRegistry)
		},
		{ title: 'Heroes', attributions: collectAttributions(heroVisualRegistry) },
		{ title: 'Units', attributions: collectAttributions(unitVisualRegistry) },
		{
			title: 'Buildings',
			attributions: collectUniqueAttributions([
				...collectAttributions(primaryBuildingVisualRegistry),
				...Object.values(secondaryBuildingVisualRegistry).flatMap((registry) =>
					collectAttributions(registry)
				),
				...collectAttributions(utilityBuildingVisualRegistry)
			])
		},
		{
			title: 'Resources',
			attributions: collectAttributions(resourceVisualRegistry)
		},
		{
			title: 'Ruins',
			attributions: collectAttributions(ruinsVisualRegistry)
		}
	]

	return (
		<main className='mx-auto max-w-3xl px-6 py-12'>
			<header className='mb-10'>
				<h1 className='font-heading text-4xl text-foreground'>Credits</h1>
				<p className='mt-3 text-muted-foreground'>
					3D models by Kay Lousberg, KayKit asset suite — CC0 / public domain.
				</p>
			</header>

			<div className='space-y-10'>
				{sections.map((section) =>
					section.attributions.length === 0 ? null : (
						<section key={section.title}>
							<h2 className='mb-3 font-heading text-xl text-foreground'>
								{section.title}
							</h2>
							<ul className='space-y-2 text-sm text-muted-foreground'>
								{section.attributions.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						</section>
					)
				)}
			</div>

			<footer className='mt-16'>
				<Link
					to='/'
					className='text-sm text-muted-foreground underline hover:text-foreground'
				>
					Back to home
				</Link>
			</footer>
		</main>
	)
}

function collectAttributions(
	registry: Readonly<
		Record<string, VisualRegistryEntry<never> | MeshAssetEntry>
	>
): string[] {
	const out: string[] = []
	for (const entry of Object.values(registry)) {
		if (entry.kind !== 'mesh') {
			continue
		}
		if (entry.attribution === undefined) {
			continue
		}
		out.push(entry.attribution)
	}
	return out
}

function collectUniqueAttributions(attributions: readonly string[]): string[] {
	return [...new Set(attributions)]
}
