import { type UnitAbility } from './registry'

/**
 * Seer "Escape": after attacking, the seer enters `retreat` mode
 * (cannot attack again this turn but may still move). Mirrors the legacy
 * post-resolution mode rule from `units/registry.ts::resolveHit`.
 */
export const escapeAbility: UnitAbility = {
	unit: 'seer',
	hooks: {
		modeAfterAttack: () => 'retreat'
	}
}
