import { createFileRoute, Link } from '@tanstack/react-router'

import { Logo } from '@/components/logo'
import { WIKI_CATEGORIES, getWikiArticlesByCategory } from '@/lib/wiki'

export const Route = createFileRoute('/wiki/')({
	component: WikiIndexPage
})

function WikiIndexPage() {
	return (
		<div>
			<div className='mb-2 flex items-center gap-3'>
				<Logo className='size-12' />
				<h1 className='font-heading text-2xl font-semibold tracking-tight'>
					Hexwardens Wiki
				</h1>
			</div>
			<p className='mb-8 text-sm text-muted-foreground'>
				Your guide to the world of Hexwardens — a turn-based hex grid strategy
				game.
			</p>

			<div className='grid gap-6 sm:grid-cols-2'>
				{Object.entries(WIKI_CATEGORIES).map(([slug, name]) => {
					const articles = getWikiArticlesByCategory(slug)
					return (
						<div
							key={slug}
							className='rounded-lg border border-border bg-card p-4'
						>
							<h2 className='mb-2 text-base font-semibold'>{name}</h2>
							<ul className='space-y-1'>
								{articles.map((article) => (
									<li key={article.slug}>
										<Link
											to='/wiki/$category/$slug'
											params={{ category: slug, slug: article.slug }}
											className='text-sm text-muted-foreground hover:text-foreground transition-colors'
										>
											{article.frontmatter.title}
										</Link>
									</li>
								))}
							</ul>
						</div>
					)
				})}
			</div>
		</div>
	)
}
