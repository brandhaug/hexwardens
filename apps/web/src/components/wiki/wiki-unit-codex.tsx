import { UnitCodexDisplay } from '@/components/game/unit-codex-display'

export function WikiUnitCodex() {
	return (
		<div className='not-prose my-6'>
			<UnitCodexDisplay showLegend={false} />
		</div>
	)
}
