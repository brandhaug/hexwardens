import { type HeroUnitType } from '@hexwardens/game-logic/domains/unit'
import { type MeshAssetEntry } from './visual-registry-types'

export const heroVisualRegistry: Record<HeroUnitType, MeshAssetEntry> = {
	berserker: {
		kind: 'mesh',
		path: '/models/heroes/berserker.glb',
		source: 'kaykit',
		rig: 'Rig_Large',
		equipment: {
			rightHand: { path: '/models/equipment/axe-2h-large.glb' }
		}
	},
	shogun: {
		kind: 'mesh',
		path: '/models/heroes/shogun.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/ninja-katana.glb' }
		}
	},
	wolf: {
		kind: 'mesh',
		path: '/models/heroes/wolf.glb',
		source: 'kaykit',
		rig: 'Rig_Medium'
	},
	orc_raider: {
		kind: 'mesh',
		path: '/models/heroes/orc_raider.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/axe-1h.glb' },
			leftHand: { path: '/models/equipment/shield-barbarian.glb' }
		}
	},
	black_knight: {
		kind: 'mesh',
		path: '/models/heroes/black_knight.glb',
		source: 'kaykit',
		rig: 'Rig_Large',
		equipment: {
			rightHand: { path: '/models/equipment/sword-2h.glb' }
		}
	},
	clanker: {
		kind: 'mesh',
		path: '/models/heroes/clanker.glb',
		source: 'kaykit',
		rig: 'Rig_Large',
		equipment: {
			rightHand: { path: '/models/equipment/war-hammer.glb' },
			leftHand: { path: '/models/equipment/shield-spikes.glb' }
		}
	},
	paladin: {
		kind: 'mesh',
		path: '/models/heroes/paladin.glb',
		source: 'kaykit',
		rig: 'Rig_Medium',
		equipment: {
			rightHand: { path: '/models/equipment/paladin-hammer.glb' },
			leftHand: { path: '/models/equipment/paladin-shield.glb' }
		}
	},
	skeleton_golem: {
		kind: 'mesh',
		path: '/models/heroes/skeleton_golem.glb',
		source: 'kaykit',
		rig: 'Rig_Large',
		equipment: {
			rightHand: { path: '/models/equipment/axe-2h-large.glb' },
			leftHand: { path: '/models/equipment/shield-barbarian-large.glb' }
		}
	},
	frostlord: {
		kind: 'mesh',
		path: '/models/heroes/frostlord.glb',
		source: 'kaykit',
		rig: 'Rig_Large',
		equipment: {
			rightHand: { path: '/models/equipment/sword-2h.glb' }
		}
	}
}
