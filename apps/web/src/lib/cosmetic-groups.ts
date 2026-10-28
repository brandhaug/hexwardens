const RANK_PREFIX = 'rank-'
const BANNER_PREFIX = 'banner-'
const TRIBE_PREFIX = 'tribe-'

export function unlockGroup(id: string): 'rank' | 'banner' | 'tribe' | 'other' {
	if (id.startsWith(RANK_PREFIX)) {
		return 'rank'
	}
	if (id.startsWith(BANNER_PREFIX)) {
		return 'banner'
	}
	if (id.startsWith(TRIBE_PREFIX)) {
		return 'tribe'
	}
	return 'other'
}
