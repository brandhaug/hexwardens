import { useLayoutEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Swords, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { tribeToColor, type Tribe } from '@hexwardens/game-logic/domains/tribe'

import { cn } from '@/lib/utils'

/**
 * Optional Daily Challenge recap shown in the Match-end overlay for
 * Public Queue matches. The host evaluator is the authoritative source —
 * this is the same data shape projected from the in-Match HUD's local
 * eval, surfaced one final time at the moment victory/defeat lands.
 */
export interface DailyChallengeOutcome {
	readonly challengeName: string
	readonly completed: boolean
	readonly completedAtTurn: number | null
	readonly target: number
}

interface GameOverOverlayProps {
	winner: Tribe | null
	playerTribe: Tribe
	turn: number
	dailyOutcome?: DailyChallengeOutcome | null | undefined
	onPlayAgain?: (() => void) | undefined
}

export function GameOverOverlay({
	winner,
	playerTribe,
	turn,
	dailyOutcome,
	onPlayAgain
}: GameOverOverlayProps) {
	const navigate = useNavigate()
	const dialogRef = useRef<HTMLDialogElement>(null)
	const playAgainRef = useRef<HTMLButtonElement>(null)
	const isVictory = winner === playerTribe
	const isDraw = winner === null
	const result = resultCopy(winner, playerTribe)

	useLayoutEffect(() => {
		// React reruns layout effects when a suspended game becomes visible again.
		// Restore the modal and its focus after lazy board assets finish loading.
		const dialog = dialogRef.current
		dialog?.showModal()
		playAgainRef.current?.focus()
		return () => dialog?.close()
	}, [])

	return (
		<dialog
			ref={dialogRef}
			onCancel={(event) => event.preventDefault()}
			aria-labelledby='game-over-title'
			className='m-0 h-dvh max-h-none w-full max-w-none border-0 p-0 text-foreground backdrop:bg-transparent fixed inset-0 z-40 flex items-center justify-center bg-background/80 outline-none'
		>
			<Card className='mx-4 w-full max-w-sm text-center'>
				<CardContent className='flex flex-col items-center gap-4 pt-8'>
					{isVictory ? (
						<Trophy className='size-14 text-primary' aria-hidden='true' />
					) : (
						<Swords
							className={
								isDraw
									? 'size-14 text-muted-foreground'
									: 'size-14 text-destructive'
							}
							aria-hidden='true'
						/>
					)}
					<h2
						id='game-over-title'
						className='font-heading text-2xl font-bold tracking-wide'
					>
						{result.title}
					</h2>
					<p className='text-muted-foreground'>{result.description}</p>
					<div className='flex items-center gap-3 rounded-md bg-muted/50 px-4 py-2'>
						{winner && (
							<div className='flex items-center gap-2'>
								<span
									className={cn('size-4 rounded-full', tribeToColor[winner])}
								/>
								<span className='font-semibold capitalize'>{winner}</span>
							</div>
						)}
						{winner && <span className='text-muted-foreground'>·</span>}
						<span className='text-sm text-muted-foreground'>Turn {turn}</span>
					</div>
					{dailyOutcome && <DailyRecap outcome={dailyOutcome} />}
				</CardContent>
				<CardFooter className='flex justify-center gap-3 pb-8'>
					<Button
						ref={playAgainRef}
						variant='default'
						className='h-11 font-heading'
						onClick={onPlayAgain ?? (() => void navigate({ to: '/' }))}
					>
						Play Again
					</Button>
				</CardFooter>
			</Card>
		</dialog>
	)
}

function DailyRecap({ outcome }: { outcome: DailyChallengeOutcome }) {
	const cleared =
		outcome.completed && outcome.completedAtTurn !== null
			? outcome.completedAtTurn
			: null

	return (
		<div
			className={cn(
				'w-full rounded-lg border px-3 py-2 text-left',
				cleared === null
					? 'border-border bg-muted/30'
					: 'border-primary/60 bg-primary/10'
			)}
			aria-label={`Daily Challenge ${outcome.challengeName} recap`}
		>
			<div className='font-heading text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase'>
				Daily Challenge · {outcome.challengeName}
			</div>
			{cleared === null ? (
				<div className='text-sm text-muted-foreground'>
					Not completed — try again tomorrow at UTC midnight.
				</div>
			) : (
				<div className='font-heading text-sm font-semibold text-primary'>
					Cleared in <span className='tabular-nums'>{cleared}</span>{' '}
					{cleared === 1 ? 'turn' : 'turns'}
				</div>
			)}
		</div>
	)
}

function resultCopy(winner: Tribe | null, playerTribe: Tribe) {
	if (winner === null) {
		return { title: 'Draw', description: 'The match ended without a winner.' }
	}
	if (winner === playerTribe) {
		return {
			title: 'Victory!',
			description: 'You won the match by defeating every opponent.'
		}
	}
	return { title: 'Defeat', description: 'Another tribe won this match.' }
}
