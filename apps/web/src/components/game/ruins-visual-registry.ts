import { type MeshAssetEntry, type VisualRender } from './visual-registry-types'

export type RuinsVisualKey = 'ruins'

export const ruinsVisualRegistry: Record<RuinsVisualKey, MeshAssetEntry> = {
	ruins: {
		kind: 'mesh',
		path: '/models/ruins/ruins.glb',
		source: 'kaykit'
	}
}

/**
 * Resolves the Ruins visual entry. Ruins use the registry scale verbatim
 * (no tile-item multiplier, no outer wrapper) so this resolver is the
 * single source of that convention for consumers.
 */
export function resolveRuinsVisual(): VisualRender {
	const entry = ruinsVisualRegistry.ruins
	return { entry, groupScale: 1, meshScale: entry.scale }
}
