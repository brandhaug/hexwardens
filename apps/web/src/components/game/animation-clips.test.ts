import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
	animationStateToLibrary,
	animationStates,
	rigAnimationLibraries,
	rigClips
} from './animation-clips'
import { type AssetRig } from './visual-registry-types'

const rigs: readonly AssetRig[] = ['Rig_Medium', 'Rig_Large']

describe('animation clips', () => {
	it('defines every gameplay animation state for each supported rig', () => {
		for (const rig of rigs) {
			const clips = rigClips[rig]
			for (const state of animationStates) {
				expect(clips[state], `${rig}.${state}`).toBeTruthy()
			}
		}
	})

	it('uses empirically verified KayKit clip names', () => {
		expect(rigClips.Rig_Medium).toEqual({
			idle: 'Idle_A',
			walk: 'Walking_A',
			attack: 'Melee_1H_Attack_Slice_Horizontal',
			defend: 'Melee_Block_Hit',
			death: 'Death_B'
		})
		expect(rigClips.Rig_Large).toEqual({
			idle: 'Idle_A',
			walk: 'Walking_A',
			attack: 'Melee_2H_Attack',
			defend: 'Melee_Block_Hit',
			death: 'Death_A'
		})
	})

	it('points every rig library at a bundled GLB', () => {
		for (const rig of rigs) {
			for (const path of Object.values(rigAnimationLibraries[rig])) {
				const relativePath = path.replace(/^\//, 'public/')
				// oxlint-disable-next-line vitest/valid-expect -- Vitest supports a second message argument for asset-specific assertion diagnostics.
				expect(existsSync(join(process.cwd(), relativePath)), path).toBe(true)
			}
		}
	})

	it('routes gameplay animation states to the expected KayKit libraries', () => {
		expect(animationStateToLibrary).toEqual({
			idle: 'general',
			walk: 'movement',
			attack: 'combat',
			defend: 'combat',
			death: 'general'
		})
	})
})
