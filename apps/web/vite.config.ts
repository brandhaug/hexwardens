import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import rehypeSlug from 'rehype-slug'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { defineConfig, lazyPlugins, type Plugin } from 'vite-plus'
import { VitePWA, type VitePluginPWAAPI } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
	const useWorkersShim =
		mode === 'test' || process.env.HEXWARDENS_USE_WORKERS_SHIM === '1'
	const port = Number(process.env.PORT) || 3001
	const host = process.env.HOST || 'localhost'
	const alias: Record<string, string> = useWorkersShim
		? {
				'cloudflare:workers': resolve(
					import.meta.dirname,
					'./src/lib/cloudflare-workers-shim.ts'
				)
			}
		: {}
	return {
		server: { port, host, strictPort: false },
		preview: { port, host },
		build: {
			// The animated GLB renderer is intentionally lazy-loaded. Its WebGL
			// runtime chunk is large but no longer blocks first paint for non-board
			// routes; keep the warning threshold aligned with that deliberate split
			// instead of masking route-level regressions elsewhere.
			chunkSizeWarningLimit: 1000
		},
		resolve: {
			tsconfigPaths: true,
			alias
		},
		plugins:
			lazyPlugins(() => {
				const pwaPlugins: Plugin<VitePluginPWAAPI>[] = VitePWA({
					registerType: 'autoUpdate',
					injectRegister: false,
					devOptions: {
						// Enabled only so /manifest.webmanifest resolves in dev — the SW
						// itself is never registered in dev (see PwaServiceWorker). No
						// navigateFallback: this is an SSR app with no static index.html,
						// so navigations must always reach the dev server.
						enabled: true,
						type: 'module'
					},
					includeAssets: [
						'favicon.ico',
						'pwa-icon.svg',
						'apple-touch-icon-180x180.png'
					],
					manifest: {
						name: 'Hexwardens',
						short_name: 'Hexwardens',
						description:
							'Turn-based hex strategy with tribes, villages, and tactical matches.',
						/* Match the live HUD chrome so the iOS/Android system bars
					   become part of the game rather than a foreign frame. */
						theme_color: '#087d97',
						background_color: '#0F3E4D',
						display: 'standalone',
						display_override: ['window-controls-overlay', 'standalone'],
						orientation: 'any',
						start_url: '/',
						id: '/',
						scope: '/',
						categories: ['games', 'strategy', 'entertainment'],
						icons: [
							{
								src: 'pwa-64x64.png',
								sizes: '64x64',
								type: 'image/png'
							},
							{
								src: 'pwa-192x192.png',
								sizes: '192x192',
								type: 'image/png'
							},
							{
								src: 'pwa-512x512.png',
								sizes: '512x512',
								type: 'image/png'
							},
							{
								src: 'maskable-icon-512x512.png',
								sizes: '512x512',
								type: 'image/png',
								purpose: 'maskable'
							}
						]
					},
					workbox: {
						globDirectory: 'dist/client',
						swDest: 'dist/client/sw.js',
						globPatterns: ['**/*.{js,css,html,ico,woff2}'],
						globIgnores: ['**/node_modules/**'],
						navigateFallback: null,
						cleanupOutdatedCaches: true,
						navigateFallbackDenylist: [/^\/api\//, /^\/_serverFn\//],
						runtimeCaching: [
							{
								urlPattern: ({ request }) => request.destination === 'image',
								handler: 'StaleWhileRevalidate',
								options: { cacheName: 'hexwardens-images' }
							}
						]
					}
				})
				return [
					// React Three Fiber primitives (`<mesh>`, `<group>`, geometries,
					// materials, lights, etc.) don't accept arbitrary attributes — R3F
					// throws "Cannot set 'data-tsd-source'" if devtools-vite injects its
					// source-locator attribute into anything inside a `<Canvas>` subtree.
					// The board scene lives under `src/components/game/`, so skip the
					// JSX source injection for that directory.
					devtools({
						// Vite+ already forwards browser logs. A second bridge echoes
						// those messages back through the server indefinitely.
						consolePiping: { enabled: false },
						injectSource: {
							enabled: true,
							ignore: { files: ['**/src/components/game/**'] }
						}
					}),
					tailwindcss(),
					tanstackStart(),
					{
						enforce: 'pre',
						...mdx({
							remarkPlugins: [
								remarkFrontmatter,
								remarkMdxFrontmatter,
								remarkGfm
							],
							rehypePlugins: [rehypeSlug]
						})
					},
					viteReact(),

					...pwaPlugins,
					{
						name: 'hexwardens-service-worker',
						buildApp: {
							order: 'post',
							async handler() {
								// Start builds multiple environments; PWA's legacy closeBundle
								// hook sees SSR config and skips generation. Wait for all assets.
								const api = pwaPlugins.find(
									(plugin) => plugin.name === 'vite-plugin-pwa'
								)?.api
								if (!api) {
									throw new Error('PWA build API is unavailable')
								}
								await api.generateSW()
							}
						}
					}
				]
			}) ?? [],
		test: {
			// Vitest v4 compatibility: preserve mock call history.
			// Remove after tests no longer rely on calls from setup or earlier tests.
			// https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
			// https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
			clearMocks: false,
			globals: true,
			exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.alchemy/**']
		}
	}
})
