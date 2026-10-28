import Prando from 'prando'
import { type BoardPosition } from '../board/position'
import { type GameState } from '../game'
import { type TileTerrain } from '../tile/tile-terrain'

/**
 * Deterministic naming for Villages, Capitals, and ruined Landmarks.
 *
 * Names derive from `(seed, position, terrain, kind)` only — never from the
 * current owning Tribe — so a Village keeps its name across Capture. Capitals
 * are flagged with a `Great ` prefix instead of a separate word list, which
 * keeps the bonus visible without doubling the table size and survives
 * level-ups where `kind` is preserved.
 *
 * Word lists are short, evocative-but-neutral fragments suited to the
 * "ancient cozy" tone — no real-world place names that would lock the game
 * into a single culture. Generated names stay under
 * {@link MAX_LANDMARK_NAME_LENGTH} so mobile Tile detail panels do not
 * overflow.
 */

export const MAX_LANDMARK_NAME_LENGTH = 24

const VILLAGE_SUFFIXES = [
	'fold',
	'reach',
	'mere',
	'haven',
	'crest',
	'hollow',
	'gate',
	'wend',
	'shade',
	'spire',
	'glen',
	'hearth',
	'rest',
	'fall',
	'stead',
	'mark'
] as const

const TERRAIN_FLAVOR: Record<TileTerrain, readonly string[]> = {
	grass: ['Green', 'Meadow', 'Vale'],
	forest: ['Pine', 'Oak', 'Birch'],
	desert: ['Sun', 'Dune', 'Sand'],
	jungle: ['Vine', 'Fern', 'Leaf'],
	swamp: ['Mire', 'Moss', 'Bog'],
	tundra: ['Frost', 'Snow', 'North'],
	terraced: ['Stone', 'Step', 'Ridge'],
	barren: ['Ash', 'Dust', 'Bare'],
	ice: ['Frost', 'Ice', 'Cold'],
	snow: ['Snow', 'Drift', 'White'],
	stone: ['Crag', 'Peak', 'Cliff'],
	water: ['Lake', 'Tide', 'Bay'],
	ocean: ['Deep', 'Salt', 'Wave']
}

const RUINS_PREFIXES = [
	'Old',
	'Lost',
	'Sunken',
	'Forgotten',
	'Broken',
	'Silent',
	'Buried',
	'Faded'
] as const

const RUINS_SUFFIXES = [
	'Watch',
	'Vault',
	'Hold',
	'Tomb',
	'Shrine',
	'Spire',
	'Cairn',
	'Gate'
] as const

/**
 * Deterministic landmark name for the village (if any) at `position`. Returns
 * `null` when the tile holds no village. Capitals receive a `Great ` prefix
 * to reinforce their importance without depending on the current owner.
 */
export function getVillageName(
	state: GameState,
	position: BoardPosition
): string | null {
	const tile = state.units.board[position.r_idx]?.[position.q_idx]
	if (!tile) {
		return null
	}
	const item = tile.item
	if (item?.type !== 'village') {
		return null
	}

	const rng = createLandmarkRng(state.seed, position, 'village')
	const flavor = TERRAIN_FLAVOR[tile.terrain]
	const prefix = flavor[rng.nextInt(0, flavor.length - 1)]
	const suffix = VILLAGE_SUFFIXES[rng.nextInt(0, VILLAGE_SUFFIXES.length - 1)]
	const stem = `${prefix}${suffix}`

	return item.kind === 'capital' ? `Great ${stem}` : stem
}

/**
 * Deterministic name for the ruins (if any) at `position`. Used in
 * exploration messages so the chronicle can reference a specific landmark.
 */
export function getRuinsName(
	state: GameState,
	position: BoardPosition
): string | null {
	const tile = state.units.board[position.r_idx]?.[position.q_idx]
	if (tile?.item?.type !== 'ruins') {
		return null
	}
	return generateRuinsName(state.seed, position)
}

/**
 * Stateless variant of {@link getRuinsName}. Exploration messages use this
 * because the ruins tile is cleared before the message is built; the seed +
 * position alone fully identify the landmark.
 */
export function generateRuinsName(
	seed: number,
	position: BoardPosition
): string {
	const rng = createLandmarkRng(seed, position, 'ruins')
	const prefix = RUINS_PREFIXES[rng.nextInt(0, RUINS_PREFIXES.length - 1)]
	const suffix = RUINS_SUFFIXES[rng.nextInt(0, RUINS_SUFFIXES.length - 1)]
	return `${prefix} ${suffix}`
}

/**
 * Per-landmark Prando seeded by mixing `(seed, q_idx, r_idx, kind)`. Small
 * primes spread neighbouring tiles to different streams; the `kind` byte
 * separates villages and ruins so a tile that loses its ruins cannot
 * accidentally inherit the ruins' name when a village is built there later.
 */
function createLandmarkRng(
	seed: number,
	position: BoardPosition,
	kind: 'village' | 'ruins'
): Prando {
	const kindByte = kind === 'village' ? 1 : 2
	const mixed =
		Math.abs(seed) * 1009 +
		position.q_idx * 31 +
		position.r_idx * 17 +
		kindByte * 7919
	return new Prando(mixed)
}
