import { X } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSwipeToDismiss } from '@/hooks/use-swipe-to-dismiss'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

interface GameDialogPanelProps {
	id: string
	title: string
	contentClassName: string
	children: ReactNode
	onClose: () => void
}

export function GameDialogPanel({
	id,
	title,
	contentClassName,
	children,
	onClose
}: GameDialogPanelProps) {
	const dialogRef = useRef<HTMLDialogElement>(null)
	const closeButtonRef = useRef<HTMLButtonElement>(null)

	useLayoutEffect(() => {
		// React reruns layout effects when a suspended game becomes visible again.
		// Restore the modal and its focus after lazy board assets finish loading.
		const dialog = dialogRef.current
		dialog?.showModal()
		closeButtonRef.current?.focus()
		return () => dialog?.close()
	}, [])

	// Swipe-down-to-dismiss for touch users. The gesture follows the finger
	// via the returned `offset` (applied as translateY) and either commits
	// (~120px or fast flick) or springs back to 0 on release. Desktop drag
	// is untouched — the hook self-gates on `pointerType === 'touch'`.
	const swipe = useSwipeToDismiss({ onDismiss: onClose })

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Only the native dialog backdrop click dismisses; native onCancel provides Escape and showModal traps focus.
		<dialog
			ref={dialogRef}
			onCancel={(event) => {
				event.preventDefault()
				onClose()
			}}
			aria-labelledby={id}
			data-game-chrome
			// Transient modal overlay — board defocuses via bg-background/85 alone.
			// Per DESIGN.md "Elevation & Depth", permanent chrome (top bar,
			// action bar, HUD chips) must not use backdrop-blur; dialog overlays
			// are the only surface where reintroducing it would be on-spec.
			className='m-0 h-dvh max-h-none w-full max-w-none border-0 p-0 text-foreground backdrop:bg-transparent fixed inset-0 z-50 flex items-end justify-center bg-background/85 outline-none sm:items-center sm:p-4'
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose()
				}
			}}
		>
			<Card
				className={cn(
					'relative flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border-x-0 border-b-0',
					'sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:border',
					'motion-safe:animate-[panel-rise_220ms_cubic-bezier(0.16,1,0.3,1)]'
				)}
				style={{
					paddingTop: 'env(safe-area-inset-top)',
					paddingBottom: 'env(safe-area-inset-bottom)',
					transform: `translate3d(0, ${swipe.offset}px, 0)`,
					// While the finger is down, track 1:1; on release, let the
					// snap-back ease so it feels springy instead of teleporting.
					transition: swipe.isDragging
						? 'none'
						: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
					touchAction: 'pan-y'
				}}
				onPointerDown={swipe.handlers.onPointerDown}
				onPointerMove={swipe.handlers.onPointerMove}
				onPointerUp={swipe.handlers.onPointerUp}
				onPointerCancel={swipe.handlers.onPointerCancel}
			>
				{/* Mobile drag-handle affordance — reads as a bottom-sheet, not a
				    fullscreen takeover. Inert on sm+ where the panel is a centered
				    modal. */}
				<div
					aria-hidden='true'
					className='mx-auto mt-2 mb-3 h-1 w-10 shrink-0 rounded-full bg-foreground/25 sm:hidden'
				/>
				{/* Close button: absolute-pinned to the panel's top-right corner so
				    it sits above the header row and stays reachable regardless of
				    title length. The Card already pads-down by
				    env(safe-area-inset-top), so the button is positioned relative
				    to the *padded* edge — using `top-2 right-2` keeps it visible
				    below any notch instead of doubling the inset. */}
				{/* oxlint-disable-next-line react-doctor/no-pure-black-shadow -- Preserve the existing game chrome bevel and shadow tokens. */}
				<button
					ref={closeButtonRef}
					type='button'
					data-press='teal'
					onClick={() => {
						haptic('tap')
						onClose()
					}}
					aria-label='Close panel'
					className='absolute top-2 right-2 z-10 flex size-11 shrink-0 items-center justify-center rounded-md border border-foreground/15 bg-background/75 text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_0_rgba(0,0,0,0.18)] hover:bg-background/90 sm:size-9'
				>
					<X className='size-5' aria-hidden='true' />
				</button>
				<CardHeader className='border-b pr-14'>
					<CardTitle
						id={id}
						className='font-heading text-lg uppercase tracking-[0.06em]'
					>
						{title}
					</CardTitle>
				</CardHeader>
				<CardContent className={contentClassName}>{children}</CardContent>
			</Card>
		</dialog>
	)
}
