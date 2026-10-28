import { type ComponentType } from 'react'

import { type MdxComponentProps } from '@/components/mdx-link'

interface WikiFrontmatter {
	title: string
	description: string
	category: string
	order: number
}

interface WikiArticle {
	slug: string
	category: string
	frontmatter: WikiFrontmatter
	Component: ComponentType<MdxComponentProps>
}

export const WIKI_CATEGORIES = {
	'getting-started': 'Getting Started',
	tribes: 'Tribes',
	units: 'Units',
	buildings: 'Buildings',
	mechanics: 'Game Mechanics'
} as const

export type WikiCategory = keyof typeof WIKI_CATEGORIES

export function isWikiCategory(category: string): category is WikiCategory {
	return category in WIKI_CATEGORIES
}

const modules = import.meta.glob<{
	default: ComponentType<MdxComponentProps>
	frontmatter: WikiFrontmatter
}>('../../content/wiki/**/*.mdx', { eager: true })

function parsePath(path: string) {
	const relative = path.replace('../../content/wiki/', '').replace('.mdx', '')
	const parts = relative.split('/')
	return { category: parts[0] ?? '', slug: parts.at(-1) ?? '' }
}

function getAllWikiArticles(): WikiArticle[] {
	return Object.entries(modules)
		.map(([path, mod]) => {
			const { category, slug } = parsePath(path)
			return {
				slug,
				category,
				frontmatter: mod.frontmatter,
				Component: mod.default
			}
		})
		.toSorted((a, b) => a.frontmatter.order - b.frontmatter.order)
}

export function getWikiArticlesByCategory(category: string): WikiArticle[] {
	return getAllWikiArticles().filter((a) => a.category === category)
}

export function getWikiArticle(
	category: string,
	slug: string
): WikiArticle | undefined {
	return getAllWikiArticles().find(
		(a) => a.category === category && a.slug === slug
	)
}
