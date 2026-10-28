import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useRef } from 'react'

import { mdxComponents } from '@/components/mdx-components'
import { TableOfContents } from '@/components/table-of-contents'
import {
	WIKI_CATEGORIES,
	getWikiArticle,
	getWikiArticlesByCategory,
	isWikiCategory
} from '@/lib/wiki'

export const Route = createFileRoute('/wiki/$category/$slug')({
	component: WikiArticlePage,
	notFoundComponent: () => (
		<div>
			<h1 className='text-2xl font-semibold tracking-tight'>
				Article not found
			</h1>
			<Link
				to='/wiki'
				className='mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
			>
				Back to Wiki
			</Link>
		</div>
	),
	beforeLoad: ({ params }) => {
		const article = getWikiArticle(params.category, params.slug)
		if (!article) {
			throw notFound()
		}
	},
	head: ({ params }) => {
		const article = getWikiArticle(params.category, params.slug)
		if (!article) {
			return {}
		}

		const { title, description } = article.frontmatter
		const fullTitle = `${title} | Hexwardens Wiki`

		return {
			meta: [
				{ title: fullTitle },
				{ name: 'description', content: description }
			]
		}
	}
})

function WikiArticlePage() {
	const { category, slug } = Route.useParams()
	const articleRef = useRef<HTMLElement>(null)
	const article = getWikiArticle(category, slug)
	if (!article) {
		throw notFound()
	}

	const { Component, frontmatter } = article
	const categoryName = isWikiCategory(category)
		? WIKI_CATEGORIES[category]
		: category

	const articles = getWikiArticlesByCategory(category)
	const currentIndex = articles.findIndex((a) => a.slug === slug)
	const prevArticle = currentIndex > 0 ? articles[currentIndex - 1] : null
	const nextArticle =
		currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null

	return (
		<div className='flex flex-col gap-8 xl:flex-row'>
			<div className='min-w-0 flex-1'>
				<div className='mb-6 flex items-center gap-1 text-xs text-muted-foreground'>
					<Link to='/wiki' className='hover:text-foreground transition-colors'>
						Wiki
					</Link>
					<span>/</span>
					<span>{categoryName}</span>
					<span>/</span>
					<span className='text-foreground'>{frontmatter.title}</span>
				</div>

				<header className='mb-8'>
					<h1 className='mb-2 text-2xl font-semibold tracking-tight'>
						{frontmatter.title}
					</h1>
					<p className='text-sm text-muted-foreground'>
						{frontmatter.description}
					</p>
				</header>

				<article
					ref={articleRef}
					className='prose prose-neutral dark:prose-invert max-w-none'
				>
					<Component components={mdxComponents} />
				</article>

				<nav className='mt-12 flex items-center justify-between border-t border-border pt-4'>
					{prevArticle ? (
						<Link
							to='/wiki/$category/$slug'
							params={{ category, slug: prevArticle.slug }}
							className='text-xs text-muted-foreground hover:text-foreground transition-colors'
						>
							&larr; {prevArticle.frontmatter.title}
						</Link>
					) : (
						<span />
					)}
					{nextArticle ? (
						<Link
							to='/wiki/$category/$slug'
							params={{ category, slug: nextArticle.slug }}
							className='text-xs text-muted-foreground hover:text-foreground transition-colors'
						>
							{nextArticle.frontmatter.title} &rarr;
						</Link>
					) : (
						<span />
					)}
				</nav>
			</div>

			<aside className='hidden w-48 shrink-0 xl:block'>
				<TableOfContents containerRef={articleRef} />
			</aside>
		</div>
	)
}
