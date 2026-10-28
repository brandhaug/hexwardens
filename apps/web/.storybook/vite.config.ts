import { defineConfig } from 'vite-plus'

// Storybook builds components independently of Start's server and PWA lifecycles.
export default defineConfig({ resolve: { tsconfigPaths: true } })
