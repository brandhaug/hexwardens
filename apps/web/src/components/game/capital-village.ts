import { type TileItem } from '@hexwardens/game-logic/tile/tile-item'

/**
 * Threshold (inclusive) at which an owned village receives the visual
 * "capital" treatment — extra elevation, firelight halo, stronger badge.
 *
 * Purely presentational: this is *not* a gameplay concept and lives in the
 * web rendering layer so we can iterate on the heuristic without touching
 * `packages/game-logic`. See PRD #159.
 */
const CAPITAL_VILLAGE_LEVEL = 5

/**
 * Render-side classifier. A village reads as a "capital" when it is owned
 * by some tribe and has reached {@link CAPITAL_VILLAGE_LEVEL}. Anything
 * else — un-owned, low-level, non-village — is plain.
 */
export function isCapitalVillage(item: TileItem | null | undefined): boolean {
	if (item?.type !== 'village') {
		return false
	}
	if (item.tribe === null) {
		return false
	}
	return item.level >= CAPITAL_VILLAGE_LEVEL
}
