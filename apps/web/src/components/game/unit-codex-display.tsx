import { useCallback } from 'react'
import {
	type Tech,
	hasResearchedTech
} from '@hexwardens/game-logic/domains/tech'

import {
	type Tribe,
	tribes,
	tribeToTribeStats
} from '@hexwardens/game-logic/domains/tribe'

import {
	generalUnitTypes,
	unitToUnitStats,
	type UnitType
} from '@hexwardens/game-logic/domains/unit'
import { capitalize } from '@/lib/utils'
import { UnitCard, type UnitAvailability } from './unit-card'

export interface UnitCodexDisplayProps {
	researchedTechs?: readonly Tech[]
	currentTribe?: Tribe
	playerMoney?: number
	onTrain?: ((unitType: UnitType) => void) | undefined
	showLegend?: boolean
}

export function UnitCodexDisplay({
	researchedTechs,
	currentTribe,
	playerMoney,
	onTrain,
	showLegend = true
}: UnitCodexDisplayProps) {
	const getAvailability = useCallback(
		(unitType: UnitType): UnitAvailability => {
			if (!researchedTechs) {
				return 'available'
			}
			const stats = unitToUnitStats[unitType]
			if (
				stats.requiredTech &&
				!hasResearchedTech(researchedTechs, stats.requiredTech)
			) {
				return 'locked'
			}
			return 'available'
		},
		[researchedTechs]
	)

	return (
		<div className='space-y-6'>
			<div>
				<div className='mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider'>
					Units
				</div>
				<div className='flex flex-wrap gap-3'>
					{generalUnitTypes.map((unitType) => (
						<UnitCard
							key={unitType}
							unitType={unitType}
							availability={getAvailability(unitType)}
							playerMoney={playerMoney}
							onTrain={onTrain}
						/>
					))}
				</div>
			</div>

			{currentTribe ? (
				<div>
					<div className='mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider'>
						Hero — {capitalize(currentTribe)}
					</div>
					<div className='flex flex-wrap gap-3'>
						<UnitCard
							unitType={tribeToTribeStats[currentTribe].heroUnit}
							availability='available'
							playerMoney={playerMoney}
							onTrain={onTrain}
							isHero
						/>
					</div>
				</div>
			) : (
				<div>
					<div className='mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider'>
						Heroes
					</div>
					<div className='flex flex-wrap gap-3'>
						{tribes.map((tribe) => (
							<div key={tribe} className='flex flex-col gap-1'>
								<span className='text-muted-foreground text-xs'>
									{capitalize(tribe)}
								</span>
								<UnitCard
									unitType={tribeToTribeStats[tribe].heroUnit}
									availability='available'
									isHero
								/>
							</div>
						))}
					</div>
				</div>
			)}

			{showLegend && (
				<div className='mt-6 flex flex-wrap items-center gap-4 border-t pt-4 text-muted-foreground text-xs'>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block size-3 rounded-sm border border-foreground/30 bg-card' />
						Available
					</span>
					{researchedTechs && (
						<span className='flex items-center gap-1.5'>
							<span className='inline-block size-3 rounded-sm bg-muted' />
							Locked (tech required)
						</span>
					)}
					<span className='flex items-center gap-1.5'>
						<span className='inline-block size-3 rounded-sm border-2 border-amber-500 bg-amber-100 dark:bg-amber-950/40' />
						Hero
					</span>
				</div>
			)}
		</div>
	)
}
