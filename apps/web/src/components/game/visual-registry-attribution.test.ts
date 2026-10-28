import {
	primaryBuildingVisualRegistry,
	secondaryBuildingVisualRegistry,
	utilityBuildingVisualRegistry
} from './building-visual-registry'
import { heroVisualRegistry } from './hero-visual-registry'
import { resourceVisualRegistry } from './resource-visual-registry'
import { ruinsVisualRegistry } from './ruins-visual-registry'
import { unitVisualRegistry } from './unit-visual-registry'
import { villageVisualRegistry } from './village-visual-registry'

interface AttributedVisual {
	readonly kind: 'mesh' | 'procedural'
	readonly source?: string
	readonly attribution?: string
}

function assertAllMeshEntriesHaveAttribution(
	label: string,
	registry: Readonly<Record<string, AttributedVisual>>
) {
	for (const [key, entry] of Object.entries(registry)) {
		if (entry.kind !== 'mesh') {
			continue
		}
		if (entry.source === 'kaykit') {
			continue
		}
		expect(
			entry.attribution,
			`${label}.${key} mesh entry is missing attribution — copy Poly Pizza's "Attribution" field verbatim, or mark KayKit entries with source: 'kaykit'`
		).toBeTruthy()
	}
}

describe('visual registry attribution', () => {
	it('every mesh entry in the village registry has an attribution string', () => {
		assertAllMeshEntriesHaveAttribution('village', villageVisualRegistry)
	})

	it('every mesh entry in the hero registry has an attribution string', () => {
		assertAllMeshEntriesHaveAttribution('hero', heroVisualRegistry)
	})

	it('every mesh entry in the unit registry has an attribution string', () => {
		assertAllMeshEntriesHaveAttribution('unit', unitVisualRegistry)
	})

	it('every mesh entry in the resource registry has an attribution string', () => {
		assertAllMeshEntriesHaveAttribution('resource', resourceVisualRegistry)
	})

	it('every mesh entry in the building registries has an attribution string', () => {
		assertAllMeshEntriesHaveAttribution(
			'primaryBuilding',
			primaryBuildingVisualRegistry
		)
		for (const [key, registry] of Object.entries(
			secondaryBuildingVisualRegistry
		)) {
			assertAllMeshEntriesHaveAttribution(`secondaryBuilding.${key}`, registry)
		}
		assertAllMeshEntriesHaveAttribution(
			'utilityBuilding',
			utilityBuildingVisualRegistry
		)
	})

	it('every mesh entry in the ruins registry has an attribution string', () => {
		assertAllMeshEntriesHaveAttribution('ruins', ruinsVisualRegistry)
	})
})
