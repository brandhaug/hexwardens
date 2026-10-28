import { isTribe, type Tribe } from '@hexwardens/game-logic/domains/tribe'

const STORAGE_KEY = 'hexwardens.recentTribe'

/**
 * Returns the tribe the player picked in the previous lobby session, if it is
 * still a valid tribe. Used to pre-select a banner when joining a fresh lobby.
 */
export function getRecentTribe(): Tribe | null {
	if (typeof localStorage === 'undefined') {
		return null
	}
	const raw = localStorage.getItem(STORAGE_KEY)
	if (raw === null) {
		return null
	}
	return isTribe(raw) ? raw : null
}

export function rememberTribe(tribe: Tribe): void {
	if (typeof localStorage === 'undefined') {
		return
	}
	localStorage.setItem(STORAGE_KEY, tribe)
}
