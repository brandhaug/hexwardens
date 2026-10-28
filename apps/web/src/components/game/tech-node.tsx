import { type NodeProps, type Node, Handle, Position } from '@xyflow/react'

import { Clock, Coins, Lock } from 'lucide-react'
import {
	type Tech,
	type ResearchChoiceStatus,
	getTechDisplayName
} from '@hexwardens/game-logic/domains/tech'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type TechStatus = ResearchChoiceStatus

export type TechNodeData = {
	tech: Tech
	status: TechStatus
	cost: number
	turnsToResearch: number
	parents: Tech[]
	passiveDescription: string
	isAligned: boolean
	turnsRemaining: number | null
	canAfford: boolean
	onResearch?: ((tech: Tech) => void) | undefined
}

export function TechNode({ data }: NodeProps<Node<TechNodeData>>) {
	const {
		tech,
		status,
		cost,
		turnsToResearch,
		parents,
		passiveDescription,
		isAligned,
		turnsRemaining,
		canAfford,
		onResearch
	} = data

	return (
		<>
			{parents.length > 0 && (
				<Handle
					type='target'
					position={Position.Left}
					className='!bg-transparent !border-0 !w-0 !h-0'
				/>
			)}

			<div
				className={cn(
					'w-48 border p-3 transition-colors',
					status === 'researched' &&
						'border-green-600/50 bg-green-100 dark:bg-green-950/40',
					status === 'in-progress' &&
						'animate-pulse border-amber-500/50 bg-amber-100 dark:bg-amber-950/40',
					status === 'available' &&
						'border-foreground/20 bg-card hover:border-foreground/40',
					status === 'locked' && 'border-muted bg-muted/30 opacity-50'
				)}
			>
				<TechNodeHeading
					tech={tech}
					status={status}
					isAligned={isAligned}
					turnsRemaining={turnsRemaining}
				/>
				<div className='mb-1.5 flex items-center gap-3 text-xs'>
					<span className='flex items-center gap-1' title='Gold cost'>
						<Coins className='size-3.5' />
						<span>{cost}</span>
					</span>
					{turnsToResearch > 0 && (
						<span className='flex items-center gap-1' title='Turns to research'>
							<Clock className='size-3.5' />
							<span>{turnsToResearch} turns</span>
						</span>
					)}
				</div>

				<p className='text-muted-foreground text-xs leading-snug'>
					{passiveDescription}
				</p>

				{status === 'available' && onResearch && (
					<Button
						variant='secondary'
						size='sm'
						className='nopan nodrag mt-2 w-full cursor-pointer'
						disabled={!canAfford}
						onClick={() => onResearch(tech)}
					>
						{canAfford ? `Research (${cost} gold)` : `Need ${cost} gold`}
					</Button>
				)}
			</div>

			<Handle
				type='source'
				position={Position.Right}
				className='!bg-transparent !border-0 !w-0 !h-0'
			/>
		</>
	)
}

function TechNodeHeading({
	tech,
	status,
	isAligned,
	turnsRemaining
}: Pick<TechNodeData, 'tech' | 'status' | 'isAligned' | 'turnsRemaining'>) {
	return (
		<div className='mb-1.5 flex items-center justify-between'>
			<span className='font-semibold text-sm'>
				{getTechDisplayName(tech)}
				{isAligned && (
					<span className='ml-1 text-amber-400' title='Tribe-aligned tech'>
						★
					</span>
				)}
			</span>
			{status === 'researched' && (
				<span className='text-green-600 dark:text-green-400' title='Researched'>
					&#10003;
				</span>
			)}
			{status === 'locked' && (
				<span className='text-muted-foreground' title='Locked'>
					<Lock className='size-3.5' />
				</span>
			)}
			{status === 'in-progress' && turnsRemaining !== null && (
				<span
					className='rounded bg-amber-500/20 px-1.5 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-400'
					title='Turns remaining'
				>
					{turnsRemaining} {turnsRemaining === 1 ? 'turn' : 'turns'} left
				</span>
			)}
		</div>
	)
}
