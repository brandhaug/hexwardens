export interface TileHighlightFlags {
	readonly isSelected: boolean
	readonly isAttackable: boolean
	readonly isMoveable: boolean
	readonly isHovered: boolean
}

/*
 * Three.js material colors for hex tile state overlays. These are sRGB
 * literals because Three.js materials cannot read CSS custom properties at
 * paint time — the renderer needs a concrete `THREE.Color`. Keep each value
 * in lockstep with the matching CSS token defined under `.dark` in
 * `apps/web/src/index.css` (the OKLch source of truth — see DESIGN.md). If
 * you re-tune the chrome palette there, mirror the change here.
 */

// Mirrors --hex-selected (oklch(0.81 0.144 80)) — match gold.
const HIGHLIGHT_SELECTED = '#f4c64a'
// Mirrors --hex-attackable (oklch(0.65 0.2 22)) — ember red.
const HIGHLIGHT_ATTACKABLE = '#ef4338'
// Mirrors --hex-moveable (oklch(0.85 0.13 88)) — pale moveable yellow-green.
export const HIGHLIGHT_MOVEABLE = '#b6e54a'
// Hover wash — pale parchment-gold; no direct CSS token because hover is
// rendered only in the Three.js layer.
export const HIGHLIGHT_HOVER = '#f6e7a2'
// Mirrors --hex-perimeter (oklch(0.72 0.18 148)) — mossy green.
export const PERIMETER_COLOR = '#5fb77a'

export function tileHighlightColor(flags: TileHighlightFlags): string | null {
	if (flags.isSelected) {
		return HIGHLIGHT_SELECTED
	}
	if (flags.isAttackable) {
		return HIGHLIGHT_ATTACKABLE
	}
	if (flags.isMoveable) {
		return HIGHLIGHT_MOVEABLE
	}
	if (flags.isHovered) {
		return HIGHLIGHT_HOVER
	}
	return null
}
