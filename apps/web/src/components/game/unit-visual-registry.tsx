import {
	type HeroUnitType,
	type UnitType
} from '@hexwardens/game-logic/domains/unit'
import {
	type MeshAssetEntry,
	type VisualRegistryEntry
} from './visual-registry-types'

export type GeneralUnitType = Exclude<UnitType, HeroUnitType>

/**
 * All units (general units and heroes) render as this KayKit Medieval Hexagon
 * ship while standing on water/ocean terrain — mirrors the gameplay rule that
 * land units shift into boat form on water (see `getEffectiveUnitStatsForTerrain`).
 */
export const waterUnitVisual: MeshAssetEntry = {
	kind: 'mesh',
	path: '/models/units/ship.glb',
	source: 'kaykit'
}

export interface UnitProceduralContext {
	readonly tribeColor: string
}

export const unitVisualRegistry: Record<
	GeneralUnitType,
	VisualRegistryEntry<UnitProceduralContext>
> = {
	caveman: {
		kind: 'mesh',
		path: '/models/units/caveman.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/caveman-spear.glb' }
		}
	},
	archer: {
		kind: 'mesh',
		path: '/models/units/archer.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			leftHand: { path: '/models/equipment/bow.glb' }
		}
	},
	guard: {
		kind: 'mesh',
		path: '/models/units/soldier.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/dagger.glb' },
			leftHand: { path: '/models/equipment/shield-square.glb' }
		}
	},
	spearman: {
		kind: 'mesh',
		path: '/models/units/spearman.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/spear.glb' }
		}
	},
	seer: {
		kind: 'mesh',
		path: '/models/units/guard.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/dagger.glb' },
			leftHand: { path: '/models/equipment/dagger.glb' }
		}
	},
	sprinter: {
		kind: 'mesh',
		path: '/models/units/tiefling.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/tiefling-sword.glb' },
			leftHand: { path: '/models/equipment/tiefling-sword.glb' }
		}
	},
	mage: {
		kind: 'mesh',
		path: '/models/units/mage.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/wand.glb' },
			leftHand: { path: '/models/equipment/spellbook.glb' }
		}
	},
	swordsman: {
		kind: 'mesh',
		path: '/models/units/swordsman.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/sword-1h.glb' },
			leftHand: { path: '/models/equipment/sword-1h.glb' }
		}
	},
	bombardier: {
		kind: 'mesh',
		path: '/models/units/bombardier.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/hammer.glb' },
			leftHand: { path: '/models/equipment/shield-spikes.glb' }
		}
	},
	tidebreaker: {
		kind: 'mesh',
		path: '/models/units/tidebreaker.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/druid-staff.glb' }
		}
	}
}
