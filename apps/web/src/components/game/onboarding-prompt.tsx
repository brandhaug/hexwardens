import { constVoid } from 'effect/Function'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type OnboardingStep } from '@/lib/onboarding/onboarding-step-controller'

interface OnboardingPromptProps {
	step: OnboardingStep
	onSkip: () => void
}

/**
 * Maps the step's anchor kind to layout classes that position the prompt
 * adjacent to the relevant control without covering it. On mobile the prompt
 * always lifts above the action dock — `bottom-[calc(var(--action-bar-h)+0.5rem)]`
 * is approximated with sufficient bottom padding plus a safe-area inset so the
 * prompt cannot eclipse the dock.
 */
function anchorPositionClasses(step: OnboardingStep): string {
	const { anchor } = step
	switch (anchor.kind) {
		case 'end-turn': {
			// Mobile: End Turn now lives bottom-right inside the action dock, so
			// the prompt floats above it. Desktop keeps End Turn in the top-bar
			// and the prompt sits just below the top bar pointing up at it.
			return 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-2 md:top-[calc(env(safe-area-inset-top)+4rem)] md:right-4 md:bottom-auto'
		}
		case 'tile': {
			// No DOM target for raw tiles — sit at the top, centered, so the
			// prompt does not cover the action bar.
			return 'top-[calc(env(safe-area-inset-top)+4rem)] left-1/2 -translate-x-1/2'
		}
		case 'action-bar': {
			// Mobile: float above the action bar but never covering it.
			// Desktop: bottom-right, above the action bar.
			return 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-2 right-2 md:left-auto md:right-4 md:bottom-[5rem]'
		}
		default: {
			return assertNever(anchor)
		}
	}
}

function arrowDirectionClass(step: OnboardingStep): string {
	const { anchor } = step
	switch (anchor.kind) {
		case 'action-bar': {
			return 'after:bottom-[-6px] after:left-8 after:rotate-45 after:border-r after:border-b'
		}
		case 'end-turn': {
			// Mobile: arrow points DOWN at the End Turn FAB sitting in the dock.
			// Desktop: arrow points UP at the End Turn pill in the top-bar.
			return 'after:bottom-[-6px] after:right-6 after:rotate-45 after:border-r after:border-b md:after:bottom-auto md:after:top-[-6px] md:after:border-r-0 md:after:border-b-0 md:after:border-l md:after:border-t'
		}
		case 'tile': {
			return 'after:top-[-6px] after:left-1/2 after:-translate-x-1/2 after:rotate-45 after:border-l after:border-t'
		}
		default: {
			return assertNever(anchor)
		}
	}
}

export function OnboardingPrompt({ step, onSkip }: OnboardingPromptProps) {
	// Tag the matching anchor element so screen readers and visual debuggers
	// can locate the target. Effect runs each step change because the active
	// element shifts. Tag is removed on unmount / step change.
	useEffect(() => {
		if (step.anchor.kind === 'tile') {
			return constVoid
		}
		const selector = `[data-onboarding-anchor="${step.anchor.kind}"]`
		const target = document.querySelector(selector)
		if (!target) {
			return constVoid
		}
		target.setAttribute('data-onboarding-active', 'true')
		return () => {
			target.removeAttribute('data-onboarding-active')
		}
	}, [step.anchor.kind])

	return (
		<div
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This live region contains block content; output only accepts phrasing content.
			role='status'
			aria-live='polite'
			aria-labelledby='onboarding-prompt-title'
			className={cn(
				'pointer-events-auto fixed z-30 max-w-[calc(100vw-1rem)] md:max-w-sm',
				'motion-reduce:transition-none',
				anchorPositionClasses(step)
			)}
			data-onboarding-step={step.id}
		>
			<div
				className={cn(
					'relative rounded-lg border border-primary/40 bg-background/95 px-4 py-3 shadow-lg ring-1 ring-foreground/10',
					"after:pointer-events-none after:absolute after:h-3 after:w-3 after:border-primary/40 after:bg-background/95 after:content-['']",
					arrowDirectionClass(step)
				)}
			>
				<div className='flex items-start gap-3'>
					<span
						aria-hidden='true'
						className='flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs'
					>
						?
					</span>
					<div className='min-w-0 flex-1'>
						<h2
							id='onboarding-prompt-title'
							className='font-heading font-semibold text-foreground text-sm'
						>
							{step.title}
						</h2>
						<p className='mt-0.5 text-muted-foreground text-xs leading-relaxed'>
							{step.body}
							{step.keyboardHint ? (
								<span className='ml-1 inline-flex items-center gap-1 text-muted-foreground/80'>
									(
									<kbd className='rounded border border-border bg-muted px-1 font-mono text-[0.625rem]'>
										{step.keyboardHint}
									</kbd>
									)
								</span>
							) : null}
						</p>
					</div>
					<Button
						onClick={onSkip}
						variant='ghost'
						size='icon-sm'
						aria-label='Skip onboarding'
						className='-mt-1 -mr-1'
					>
						<X className='size-4' />
					</Button>
				</div>
			</div>
		</div>
	)
}
