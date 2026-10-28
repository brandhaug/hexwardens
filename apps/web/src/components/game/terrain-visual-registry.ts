import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'

export interface TerrainVisualEntry {
	readonly meshPath: string
	readonly overlayColor?: string
	readonly overlayOpacity?: number
}

const grass = '/models/terrain/hex-grass.glb'
const water = '/models/terrain/hex-water.glb'

export const terrainVisualRegistry: Record<TileTerrain, TerrainVisualEntry> = {
	grass: { meshPath: grass },
	forest: { meshPath: grass },
	jungle: {
		meshPath: grass,
		overlayColor: '#20a85b',
		overlayOpacity: 0.12
	},
	swamp: {
		meshPath: grass,
		overlayColor: '#87a34d',
		overlayOpacity: 0.22
	},
	desert: {
		meshPath: grass,
		overlayColor: '#f0ca5d',
		overlayOpacity: 0.42
	},
	barren: {
		meshPath: grass,
		overlayColor: '#c98651',
		overlayOpacity: 0.34
	},
	terraced: {
		meshPath: grass,
		overlayColor: '#d7b857',
		overlayOpacity: 0.28
	},
	tundra: {
		meshPath: grass,
		overlayColor: '#b8d7aa',
		overlayOpacity: 0.34
	},
	snow: {
		meshPath: grass,
		overlayColor: '#f4fbfb',
		overlayOpacity: 0.64
	},
	ice: {
		meshPath: water,
		overlayColor: '#bdf2f7',
		overlayOpacity: 0.48
	},
	stone: {
		meshPath: grass,
		overlayColor: '#8a8474',
		overlayOpacity: 0.42
	},
	water: { meshPath: water },
	ocean: {
		meshPath: water,
		overlayColor: '#0c7898',
		overlayOpacity: 0.36
	}
}
