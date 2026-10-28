import { cn } from '@/lib/utils'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'

export const terrainToClassName: Record<TileTerrain, string> = {
	grass: cn('fill-green-500 hover:fill-green-600'),
	snow: cn('fill-white hover:fill-gray-100'),
	stone: cn('fill-gray-500 hover:fill-gray-600'),
	water: cn('fill-blue-500 hover:fill-blue-600'),
	ocean: cn('fill-blue-700 hover:fill-blue-800'),
	forest: cn('fill-emerald-800 hover:fill-emerald-900'),
	desert: cn('fill-amber-500 hover:fill-amber-600'),
	jungle: cn('fill-green-800 hover:fill-green-900'),
	swamp: cn('fill-green-700 hover:fill-green-800'),
	tundra: cn('fill-blue-300 hover:fill-blue-400'),
	terraced: cn('fill-amber-300 hover:fill-amber-400'),
	barren: cn('fill-gray-500 hover:fill-gray-600'),
	ice: cn('fill-blue-300 hover:fill-blue-400')
}
