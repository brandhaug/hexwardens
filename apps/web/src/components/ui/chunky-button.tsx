import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

// The brand's signature "tabletop token" control: a beveled, gradient button
// with an inset highlight + chunky 2-color drop shadow (DESIGN.md — the button
// shape is `rounded-md` plus the chunky drop shadow, no hex-notch clip).
//
// `gold` is the firelight-gold primary ("one per screen region"), `teal` is the
// secondary command chrome, `ghost` is the quiet tertiary. Each variant wires
// its matching `data-press` ramp (see `[data-press]` in index.css) for the
// press-into-the-board feedback and its reduced-motion handling.
export type ChunkyButtonVariant = 'gold' | 'teal' | 'ghost'

// `min-h-12` keeps the chunky button at a >=44px touch target on its own,
// independent of the base shadcn `Button`'s `coarse:` bumps. The visible
// `focus-visible` ring uses the gold `ring` token for keyboard nav (WCAG 2.2).
const base =
	'group relative inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 px-4 text-center font-heading uppercase tracking-[0.08em] transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50'

const variantStyles: Record<ChunkyButtonVariant, string> = {
	gold: 'border-gold-edge bg-linear-to-b from-gold-top to-gold-bottom text-gold-text shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_0_var(--gold-bevel),0_10px_18px_var(--gold-cast-strong)] hover:from-gold-top-hover hover:to-gold-bottom-hover',
	teal: 'border-teal-mist/55 bg-linear-to-b from-teal-top to-teal-bottom text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_0_var(--teal-bevel),0_10px_18px_var(--teal-cast-strong)] hover:from-teal-top-hover hover:to-teal-bottom-hover',
	ghost:
		'border-foreground/15 bg-card/30 text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-foreground/25 hover:bg-card/45'
}

const pressMap: Record<ChunkyButtonVariant, 'gold' | 'teal' | undefined> = {
	gold: 'gold',
	teal: 'teal',
	ghost: undefined
}

type ChunkyButtonProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	'className'
> & {
	variant: ChunkyButtonVariant
	className?: string
	children: ReactNode
}

// The signature chunky control. Fires a `haptic('tap')` on click (composed
// ahead of any caller-supplied `onClick`) and wires `data-press` so the press
// ramp + reduced-motion handling in index.css apply without reimplementation.
export function ChunkyButton({
	variant,
	className,
	children,
	onClick,
	type = 'button',
	...props
}: ChunkyButtonProps) {
	return (
		<button
			// oxlint-disable-next-line react/button-has-type -- This wrapper forwards the typed button type prop with a default of button.
			type={type}
			data-press={pressMap[variant]}
			className={cn(base, variantStyles[variant], className)}
			onClick={(event) => {
				haptic('tap')
				onClick?.(event)
			}}
			{...props}
		>
			{children}
		</button>
	)
}
