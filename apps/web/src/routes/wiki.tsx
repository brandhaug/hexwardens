import {
	createFileRoute,
	Link,
	Outlet,
	useMatches
} from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'

import { Logo } from '@/components/logo'
import { WIKI_CATEGORIES, getWikiArticlesByCategory } from '@/lib/wiki'

export const Route = createFileRoute('/wiki')({
	component: WikiLayout
})

function WikiLayout() {
	const matches = useMatches()
	const currentPath = matches.at(-1)?.fullPath ?? ''

	const navContent = (
		<>
			<Link
				to='/wiki'
				className='mb-1 hidden items-center gap-1 font-heading text-lg font-bold uppercase text-foreground hover:text-foreground/80 md:flex'
			>
				<Logo className='size-8' />
				<span>Hexwardens Wiki</span>
			</Link>
			{Object.entries(WIKI_CATEGORIES).map(([slug, name]) => {
				const articles = getWikiArticlesByCategory(slug)
				return (
					<div key={slug}>
						<h3 className='mb-1 text-sm font-semibold uppercase tracking-wider text-foreground'>
							{name}
						</h3>
						<ul className='flex flex-col gap-0.5'>
							{articles.map((article) => {
								const articlePath = `/wiki/${slug}/${article.slug}`
								const isActive = currentPath === articlePath
								return (
									<li key={article.slug}>
										<Link
											to='/wiki/$category/$slug'
											params={{
												category: slug,
												slug: article.slug
											}}
											className={`block rounded-md px-2 py-2 text-sm transition-colors md:py-1 ${
												isActive
													? 'bg-muted font-medium text-foreground'
													: 'text-muted-foreground hover:text-foreground'
											}`}
										>
											{article.frontmatter.title}
										</Link>
									</li>
								)
							})}
						</ul>
					</div>
				)
			})}
		</>
	)

	return (
		<div
			className='mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:flex-row md:gap-8 md:px-6 md:py-8'
			style={{
				paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))',
				paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))'
			}}
		>
			<details className='group rounded-md border border-border bg-card shadow-[0_2px_0_oklch(0_0_0/0.18)] md:hidden'>
				<summary className='flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 font-heading font-bold text-base text-foreground uppercase tracking-[0.06em]'>
					<span className='flex items-center gap-2'>
						<Logo className='size-7' />
						Wiki
					</span>
					<ChevronDown
						aria-hidden='true'
						className='size-4 text-muted-foreground transition-transform group-open:rotate-180'
					/>
				</summary>
				<nav className='flex flex-col gap-4 border-t border-border p-4'>
					{navContent}
				</nav>
			</details>

			<aside className='hidden w-56 shrink-0 md:block'>
				<nav className='sticky top-8 flex flex-col gap-4'>{navContent}</nav>
			</aside>

			<main className='selectable min-w-0 flex-1'>
				<Outlet />
			</main>
		</div>
	)
}
