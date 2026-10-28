import { getCounterAttack } from '@hexwardens/game-logic/combat/counter-attack'
import { Button } from '@/components/ui/button'
import {
	getTechDisplayName,
	techTree
} from '@hexwardens/game-logic/domains/tech'
import {
	unitToUnitStats,
	getUnitDisplayName,
	isHeroUnitType,
	unitPassiveToDescription,
	heroUnitToAbility,
	type UnitType
} from '@hexwardens/game-logic/domains/unit'
import { cn } from '@/lib/utils'

export type UnitAvailability = 'available' | 'locked'

export interface UnitCardProps {
	unitType: UnitType
	availability?: UnitAvailability
	playerMoney?: number | undefined
	onTrain?: ((unitType: UnitType) => void) | undefined
	isHero?: boolean
}

export function UnitCard({
	unitType,
	availability = 'available',
	playerMoney,
	onTrain,
	isHero = false
}: UnitCardProps) {
	const stats = unitToUnitStats[unitType]
	const canAfford = playerMoney === undefined || playerMoney >= stats.cost

	return (
		<div
			className={cn(
				'relative w-48 border p-3 transition-colors',
				isHero && 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30',
				!isHero &&
					availability === 'available' &&
					'border-foreground/20 bg-card',
				!isHero &&
					availability === 'locked' &&
					'border-muted bg-muted/30 opacity-50'
			)}
		>
			<div className='mb-1.5 flex items-center gap-2'>
				<span className='font-semibold text-sm'>
					{getUnitDisplayName(unitType)}
				</span>
			</div>

			<div className='mb-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs'>
				<span title='Health'>HP {stats.health}</span>
				<span title='Attack'>ATK {stats.attack}</span>
				<span title='Counterattack strength'>
					Counter {getCounterAttack(unitType, 'grass')}
				</span>
				<span title='Defense'>DEF {stats.defense}</span>
				<span title='Movement'>MOV {stats.movement}</span>
				<span title='Range'>RNG {stats.range}</span>
				<span title='Base sight before terrain and research bonuses'>
					Sight {stats.explorationRange}
				</span>
				<span title='Cost'>{stats.cost} gold</span>
			</div>

			<UnitCapabilities unitType={unitType} isHero={isHero} />
			{isHero && (
				<p className='mt-2 text-xs text-muted-foreground'>
					Summoned with a level-5 village reward.
				</p>
			)}
			{onTrain && !isHero && (
				<p className='mt-2 text-xs text-muted-foreground'>
					Recruits can act next turn.
				</p>
			)}

			{availability === 'available' && onTrain && !isHero && (
				<Button
					variant='default'
					size='sm'
					className='mt-2 w-full'
					disabled={!canAfford}
					onClick={() => onTrain(unitType)}
				>
					{canAfford ? `Train (${stats.cost} gold)` : `Need ${stats.cost} gold`}
				</Button>
			)}
		</div>
	)
}

function UnitCapabilities({
	unitType,
	isHero
}: {
	unitType: UnitType
	isHero: boolean
}) {
	const stats = unitToUnitStats[unitType]
	const passive = stats.passive ? unitPassiveToDescription[stats.passive] : null
	const heroAbility =
		isHero && isHeroUnitType(unitType) ? heroUnitToAbility[unitType] : null

	return (
		<>
			<div className='mb-1.5 flex flex-wrap gap-1'>
				{stats.air && (
					<span className='rounded bg-sky-100 px-1.5 py-0.5 text-sky-700 text-xs dark:bg-sky-950/40 dark:text-sky-300'>
						Ranged
					</span>
				)}
				{stats.canAttackAfterMove && (
					<span className='rounded bg-green-100 px-1.5 py-0.5 text-green-700 text-xs dark:bg-green-950/40 dark:text-green-300'>
						Move+Attack
					</span>
				)}
				{stats.specialAttackAttribute && (
					<span className='rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 text-xs capitalize dark:bg-purple-950/40 dark:text-purple-300'>
						{stats.specialAttackAttribute}
					</span>
				)}
			</div>

			{passive && (
				<p className='text-muted-foreground text-xs leading-snug'>
					<span className='font-medium text-foreground'>{passive.name}:</span>{' '}
					{passive.description}
				</p>
			)}

			{heroAbility && (
				<p className='text-muted-foreground text-xs leading-snug'>
					<span className='font-medium text-amber-600 dark:text-amber-400'>
						{heroAbility.name}:
					</span>{' '}
					{heroAbility.description}
				</p>
			)}

			{stats.requiredTech && (
				<div className='mt-1.5 text-muted-foreground/70 text-xs'>
					Requires: {getTechDisplayName(stats.requiredTech)} (Tier{' '}
					{techTree[stats.requiredTech].tier})
				</div>
			)}

			{!stats.requiredTech && !isHero && (
				<div className='mt-1.5 text-green-600 text-xs dark:text-green-400'>
					No tech required
				</div>
			)}
		</>
	)
}
