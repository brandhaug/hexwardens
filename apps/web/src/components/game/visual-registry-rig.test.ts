import { heroVisualRegistry } from './hero-visual-registry'
import { unitVisualRegistry } from './unit-visual-registry'
import {
	type AssetRig,
	type VisualRegistryEntry
} from './visual-registry-types'

const validRigs: ReadonlySet<string> = new Set<AssetRig>([
	'Rig_Medium',
	'Rig_Large'
])

function assertRigNames(
	label: string,
	registry: Readonly<Record<string, VisualRegistryEntry<never>>>
) {
	for (const [key, entry] of Object.entries(registry)) {
		if (entry.kind !== 'mesh') {
			continue
		}
		if (entry.rig === undefined) {
			continue
		}
		expect(validRigs.has(entry.rig), `${label}.${key}`).toBe(true)
	}
}

describe('visual registry rigs', () => {
	it('uses only supported rig names for heroes', () => {
		assertRigNames('hero', heroVisualRegistry)
	})

	it('uses only supported rig names for units', () => {
		assertRigNames('unit', unitVisualRegistry)
	})
})
