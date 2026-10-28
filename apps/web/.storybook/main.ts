import tailwindcss from '@tailwindcss/vite'
import { type StorybookConfig } from '@storybook/react-vite'
import { resolve } from 'node:path'

const here = import.meta.dirname

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.@(ts|tsx)'],
	framework: {
		name: '@storybook/react-vite',
		// Components have no Start server or service-worker build lifecycle.
		options: { builder: { viteConfigPath: resolve(here, 'vite.config.ts') } }
	},
	staticDirs: ['../public'],
	viteFinal: (cfg) => {
		cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()]
		cfg.resolve = cfg.resolve ?? {}
		cfg.resolve.alias = {
			'@': resolve(here, '../src'),
			'cloudflare:workers': resolve(
				here,
				'../src/lib/cloudflare-workers-shim.ts'
			)
		}
		return cfg
	}
}

export default config
