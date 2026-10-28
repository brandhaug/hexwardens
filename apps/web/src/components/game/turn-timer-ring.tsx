import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
	computeRingProgress,
	formatSeconds,
	type TurnTimerThresholds,
	type TurnTimerTone
} from './turn-timer-math'

const timerStyle: React.CSSProperties & Record<`--${string}`, string | number> =
	{
		// Firelight gold → amber → destructive, all OKLCH.
		'--ring-normal': 'oklch(0.78 0.14 75)',
		'--ring-warning': 'oklch(0.74 0.17 55)',
		'--ring-critical': 'oklch(0.64 0.22 27)'
	}

interface TurnTimerRingProps {
	secondsRemaining: number | null
	totalSeconds: number | null
	/** Pixel offset the ring draws outside the wrapped content. */
	inset?: number
	strokeWidth?: number
	thresholds?: TurnTimerThresholds
	label?: string
	/** Shape of the ring. `rect` hugs a button; `circle` sits as a halo. */
	outline?: 'rect' | 'circle'
	children: ReactNode
	className?: string
}

const toneStrokeClass: Record<TurnTimerTone, string> = {
	normal: 'stroke-[var(--ring-normal)]',
	warning: 'stroke-[var(--ring-warning)]',
	critical: 'stroke-[var(--ring-critical)]'
}

const toneTextClass: Record<TurnTimerTone, string> = {
	normal: 'text-[var(--ring-normal)]',
	warning: 'text-[var(--ring-warning)]',
	critical: 'text-[var(--ring-critical)]'
}

export function TurnTimerRing({
	secondsRemaining,
	totalSeconds,
	inset = 5,
	strokeWidth = 2.5,
	thresholds,
	label = 'Turn time remaining',
	outline = 'rect',
	children,
	className
}: TurnTimerRingProps) {
	if (secondsRemaining === null || totalSeconds === null || totalSeconds <= 0) {
		return <>{children}</>
	}

	const progress = computeRingProgress({
		secondsRemaining,
		totalSeconds,
		thresholds
	})

	const readout = formatSeconds(secondsRemaining)
	const a11y = `${label}: ${readout}`

	// Path starts at top-centre and runs counterclockwise, so the
	// dash recedes against the direction of motion — depleting CCW.
	const rectPath = 'M 50 0 L 0 0 L 0 100 L 100 100 L 100 0 Z'
	const circlePath =
		'M 50 0 A 50 50 0 0 0 0 50 A 50 50 0 0 0 50 100 A 50 50 0 0 0 100 50 A 50 50 0 0 0 50 0 Z'

	return (
		<div
			className={cn(
				'group/timer relative inline-flex items-center justify-center',
				className
			)}
			style={timerStyle}
			role='timer'
			aria-label={a11y}
			aria-live={progress.tone === 'critical' ? 'assertive' : 'off'}
			title={a11y}
		>
			<svg
				viewBox='0 0 100 100'
				preserveAspectRatio='none'
				className={cn(
					'pointer-events-none absolute',
					progress.tone === 'critical' &&
						'motion-safe:animate-[timer-pulse_1.2s_ease-in-out_infinite]'
				)}
				style={{
					top: -inset,
					left: -inset,
					right: -inset,
					bottom: -inset,
					width: `calc(100% + ${inset * 2}px)`,
					height: `calc(100% + ${inset * 2}px)`,
					overflow: 'visible'
				}}
				aria-hidden='true'
			>
				<path
					d={outline === 'circle' ? circlePath : rectPath}
					fill='none'
					pathLength={100}
					strokeWidth={strokeWidth}
					vectorEffect='non-scaling-stroke'
					className='stroke-border/30'
				/>
				<path
					d={outline === 'circle' ? circlePath : rectPath}
					fill='none'
					pathLength={100}
					strokeWidth={strokeWidth}
					strokeLinecap='round'
					strokeDasharray={100}
					strokeDashoffset={progress.dashOffset}
					vectorEffect='non-scaling-stroke'
					className={cn(
						'transition-[stroke-dashoffset,stroke] duration-1000 ease-linear',
						progress.tone !== 'normal' && 'drop-shadow-[0_0_4px_currentColor]',
						toneStrokeClass[progress.tone]
					)}
				/>
			</svg>
			<span
				className={cn(
					'pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full',
					'rounded-sm border border-border/60 bg-card/95 px-1.5 py-0.5',
					'font-heading font-semibold tabular-nums text-[0.625rem] leading-none tracking-wider',
					'opacity-0 shadow-md transition-opacity duration-150',
					'group-hover/timer:opacity-100 group-focus-within/timer:opacity-100',
					progress.tone !== 'normal' && 'opacity-100',
					toneTextClass[progress.tone]
				)}
				aria-hidden='true'
			>
				{readout}
			</span>
			{children}
		</div>
	)
}
