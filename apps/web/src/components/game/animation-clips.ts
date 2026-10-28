import { type AssetRig } from './visual-registry-types'

export type UnitAnimationState = 'idle' | 'walk' | 'attack' | 'defend' | 'death'
export type AnimationLibraryKind = 'general' | 'movement' | 'combat'

export type RigClipMap = Record<UnitAnimationState, string>

export const rigClips: Record<AssetRig, RigClipMap> = {
	Rig_Medium: {
		idle: 'Idle_A',
		walk: 'Walking_A',
		attack: 'Melee_1H_Attack_Slice_Horizontal',
		defend: 'Melee_Block_Hit',
		death: 'Death_B'
	},
	Rig_Large: {
		idle: 'Idle_A',
		walk: 'Walking_A',
		attack: 'Melee_2H_Attack',
		defend: 'Melee_Block_Hit',
		death: 'Death_A'
	}
}

export const animationStates: readonly UnitAnimationState[] = [
	'idle',
	'walk',
	'attack',
	'defend',
	'death'
]

export const animationStateToLibrary: Record<
	UnitAnimationState,
	AnimationLibraryKind
> = {
	idle: 'general',
	walk: 'movement',
	attack: 'combat',
	defend: 'combat',
	death: 'general'
}

export const rigAnimationLibraries: Record<
	AssetRig,
	Record<AnimationLibraryKind, string>
> = {
	Rig_Medium: {
		general: '/models/animations/rig-medium-general.glb',
		movement: '/models/animations/rig-medium-movement-basic.glb',
		combat: '/models/animations/rig-medium-combat-melee.glb'
	},
	Rig_Large: {
		general: '/models/animations/rig-large-general.glb',
		movement: '/models/animations/rig-large-movement-basic.glb',
		combat: '/models/animations/rig-large-combat-melee.glb'
	}
}
