import { defineConfig } from 'vite-plus'
import { lintConfig } from './lint.config.ts'

export default defineConfig({
	staged: {
		'*.{ts,tsx,js,jsx,json,jsonc,md,mdx,css,yml,yaml}': 'vp fmt --write'
	},
	run: { cache: { scripts: true } },
	fmt: {
		ignorePatterns: ['**/routeTree.gen.ts'],
		useTabs: true,
		tabWidth: 2,
		printWidth: 80,
		singleQuote: true,
		jsxSingleQuote: true,
		quoteProps: 'as-needed',
		trailingComma: 'none',
		semi: false,
		arrowParens: 'always',
		bracketSameLine: false,
		bracketSpacing: true
	},
	lint: lintConfig
})
