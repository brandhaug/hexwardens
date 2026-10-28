import { AlertTriangle, RotateCcw, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type SavedMatchRecord } from '@hexwardens/game-logic/match/saved-match'
import {
	savedMatchPromptSummary,
	savedMatchPromptTitle
} from './saved-match-prompt-copy'

interface SavedMatchMenuProps {
	readonly savedMatch: SavedMatchRecord
	readonly onContinue: () => void
	readonly onNewMatch: () => void
	readonly onBack?: (() => void) | undefined
}

interface SavedMatchConflictMenuProps {
	readonly local: SavedMatchRecord
	readonly remote: SavedMatchRecord
	readonly recommended: 'local' | 'remote'
	readonly onUseLocal: () => void
	readonly onUseRemote: () => void
	readonly onBack?: (() => void) | undefined
}

interface SavedMatchIncompatibleMenuProps {
	readonly savedMatch: SavedMatchRecord
	readonly onStartFresh: () => void
	readonly onBack?: (() => void) | undefined
}

export function SavedMatchMenu({
	savedMatch,
	onContinue,
	onNewMatch,
	onBack
}: SavedMatchMenuProps) {
	return (
		<MenuShell onBack={onBack}>
			<SavedMatchCard savedMatch={savedMatch} />
			<div className='flex flex-col gap-3'>
				<Button
					className='w-full py-6 text-base'
					onClick={onContinue}
					aria-label='Continue saved match'
				>
					<RotateCcw aria-hidden='true' />
					Continue Match
				</Button>
				<Button
					variant='outline'
					className='w-full py-6 text-base'
					onClick={onNewMatch}
				>
					<Swords aria-hidden='true' />
					New Match
				</Button>
			</div>
		</MenuShell>
	)
}

export function SavedMatchIncompatibleMenu({
	savedMatch,
	onStartFresh,
	onBack
}: SavedMatchIncompatibleMenuProps) {
	return (
		<MenuShell onBack={onBack}>
			<div className='flex items-start gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-5'>
				<div className='grid size-10 shrink-0 place-items-center rounded-md border border-destructive/40 bg-destructive/15 text-destructive'>
					<AlertTriangle aria-hidden='true' className='size-5' />
				</div>
				<div className='min-w-0'>
					{/* oxlint-disable-next-line react-doctor/no-repeated-kicker-labels -- Repeated labels distinguish the existing saved-match choices. */}
					<p className='font-heading text-[0.7rem] font-semibold tracking-[0.18em] text-destructive uppercase'>
						Saved Match unavailable
					</p>
					<h3 className='mt-1 font-heading text-lg font-semibold leading-tight'>
						This Saved Match isn't compatible
					</h3>
					<p className='mt-2 max-w-[52ch] text-sm text-muted-foreground'>
						The stored Match was saved by a different version of Hexwardens and
						can no longer be resumed safely. Start a fresh Match to continue —
						the old Saved Match will be replaced.
					</p>
					<p className='mt-3 text-xs text-muted-foreground'>
						{savedMatchPromptSummary(savedMatch)}
					</p>
				</div>
			</div>
			<Button className='w-full py-6 text-base' onClick={onStartFresh}>
				<Swords aria-hidden='true' />
				Start Fresh
			</Button>
		</MenuShell>
	)
}

export function SavedMatchConflictMenu({
	local,
	remote,
	recommended,
	onUseLocal,
	onUseRemote,
	onBack
}: SavedMatchConflictMenuProps) {
	return (
		<MenuShell onBack={onBack}>
			<div>
				<p className='font-heading text-[0.7rem] font-semibold tracking-[0.18em] text-primary uppercase'>
					Choose Saved Match
				</p>
				<h3 className='mt-1 font-heading text-lg font-semibold leading-tight'>
					Two devices have progress
				</h3>
				<p className='mt-2 max-w-[52ch] text-sm text-muted-foreground'>
					Pick the Match to keep. The other revision will be replaced during
					sync.
				</p>
			</div>
			<div className='grid gap-3 sm:grid-cols-2'>
				<ConflictChoice
					label='This Device'
					savedMatch={local}
					isRecommended={recommended === 'local'}
					onChoose={onUseLocal}
				/>
				<ConflictChoice
					label='Cloud Copy'
					savedMatch={remote}
					isRecommended={recommended === 'remote'}
					onChoose={onUseRemote}
				/>
			</div>
		</MenuShell>
	)
}

function MenuShell({
	title = 'Single Player',
	onBack,
	children
}: {
	readonly title?: string
	readonly onBack?: (() => void) | undefined
	readonly children: React.ReactNode
}) {
	return (
		<div className='mx-auto flex w-full max-w-[620px] flex-col gap-6'>
			<div className='flex flex-row items-center justify-between gap-3'>
				<h2 className='font-heading text-2xl font-semibold tracking-[0.02em]'>
					{title}
				</h2>
			</div>
			{children}
			{onBack && (
				<div className='flex pt-2'>
					<Button type='button' variant='outline' onClick={onBack}>
						Back
					</Button>
				</div>
			)}
		</div>
	)
}

function SavedMatchCard({
	savedMatch,
	className
}: {
	readonly savedMatch: SavedMatchRecord
	readonly className?: string
}) {
	return (
		<div
			className={cn(
				'rounded-lg border border-border/70 bg-card/40 p-5',
				className
			)}
		>
			<p className='font-heading text-[0.7rem] font-semibold tracking-[0.18em] text-primary uppercase'>
				Saved Match
			</p>
			<h3 className='mt-1 font-heading text-xl font-semibold leading-tight'>
				{savedMatchPromptTitle(savedMatch)}
			</h3>
			<dl className='mt-4 grid grid-cols-3 gap-2 text-center'>
				<PromptStat label='Turn' value={String(savedMatch.turn)} />
				<PromptStat label='Board' value={savedMatch.mapSize} />
				<PromptStat
					label='Opponents'
					value={String(savedMatch.opponentCount)}
				/>
			</dl>
		</div>
	)
}

function ConflictChoice({
	label,
	savedMatch,
	isRecommended,
	onChoose
}: {
	readonly label: string
	readonly savedMatch: SavedMatchRecord
	readonly isRecommended: boolean
	readonly onChoose: () => void
}) {
	return (
		<div className='flex flex-col gap-3 rounded-lg border border-border/70 bg-card/40 p-4'>
			<div className='flex items-center justify-between gap-3'>
				<span className='font-heading text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase'>
					{label}
				</span>
				{isRecommended && (
					<span className='rounded-sm bg-primary px-2 py-1 font-heading text-[0.6rem] font-semibold tracking-[0.16em] text-primary-foreground uppercase'>
						Newer
					</span>
				)}
			</div>
			<div>
				<div className='font-heading text-base font-semibold leading-tight'>
					{savedMatchPromptTitle(savedMatch)}
				</div>
				<div className='mt-1 text-sm text-muted-foreground'>
					{savedMatchPromptSummary(savedMatch)}
				</div>
			</div>
			<Button
				onClick={onChoose}
				variant={isRecommended ? 'default' : 'outline'}
			>
				Use This Match
			</Button>
		</div>
	)
}

function PromptStat({
	label,
	value
}: {
	readonly label: string
	readonly value: string
}) {
	return (
		<div className='flex flex-col gap-1 rounded-md bg-background/30 p-2'>
			<span className='font-heading text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase'>
				{label}
			</span>
			<span className='truncate font-heading text-sm font-semibold capitalize'>
				{value}
			</span>
		</div>
	)
}
