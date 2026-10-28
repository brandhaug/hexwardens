import { includesValue } from './type-utils'

export const difficulties = [
	'Beginner',
	'Intermediate',
	'Advanced',
	'Expert',
	'Legend'
] as const
export type Difficulty = (typeof difficulties)[number]

export function isDifficulty(value: string): value is Difficulty {
	return includesValue(difficulties, value)
}
