export const villageLevels = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
] as const
export type VillageLevel = (typeof villageLevels)[number]

export const villagePerks = [
	'expand_sight',
	'instant_gold',
	'increase_population',
	'extra_money',
	'expand_range',
	'special_unit',
	'extra_experience'
] as const
export type VillagePerk = (typeof villagePerks)[number]

export const villageKinds = ['capital', 'regular'] as const
export type VillageKind = (typeof villageKinds)[number]
