import { X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	formatShortcutLabel,
	groupShortcutsByCategory,
	type ShortcutEntry
} from '@/lib/shortcuts/shortcut-registry'

interface ShortcutHelpOverlayProps {
	registry: readonly ShortcutEntry[]
	onClose: () => void
}

export function ShortcutHelpOverlay({
	registry,
	onClose
}: ShortcutHelpOverlayProps) {
	const dialogRef = useRef<HTMLDialogElement>(null)
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const groups = groupShortcutsByCategory(registry)

	useLayoutEffect(() => {
		// React reruns layout effects when a suspended game becomes visible again.
		// Restore the modal and its focus after lazy board assets finish loading.
		const dialog = dialogRef.current
		dialog?.showModal()
		closeButtonRef.current?.focus()
		return () => dialog?.close()
	}, [])

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Only the native dialog backdrop click dismisses; native onCancel provides Escape and showModal traps focus.
		<dialog
			ref={dialogRef}
			onCancel={(event) => {
				event.preventDefault()
				onClose()
			}}
			aria-labelledby='shortcut-help-title'
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					onClose()
				}
			}}
			className='m-0 h-dvh max-h-none w-full max-w-none border-0 p-0 text-foreground backdrop:bg-transparent fixed inset-0 z-40 flex items-center justify-center bg-background/80 outline-none'
		>
			<Card className='mx-4 w-full max-w-md'>
				<CardHeader className='relative pr-14'>
					<button
						ref={closeButtonRef}
						type='button'
						aria-label='Close keyboard shortcuts'
						onClick={onClose}
						className='absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring'
					>
						<X className='size-5' aria-hidden />
					</button>
					<CardTitle
						id='shortcut-help-title'
						className='font-heading text-xl tracking-wide'
					>
						Keyboard shortcuts
					</CardTitle>
				</CardHeader>
				<CardContent className='flex flex-col gap-5'>
					{groups.map((group) => (
						<section key={group.category} className='flex flex-col gap-2'>
							<h3 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>
								{group.category}
							</h3>
							<ul className='flex flex-col gap-1.5'>
								{group.entries.map((entry) => (
									<li
										key={`${entry.code}:${entry.shift ?? false}:${entry.meta ?? false}`}
										className='flex items-center justify-between gap-4'
									>
										<span className='text-sm'>{entry.description}</span>
										<kbd className='inline-flex h-7 items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-xs font-semibold'>
											{formatShortcutLabel(entry)}
										</kbd>
									</li>
								))}
							</ul>
						</section>
					))}
				</CardContent>
			</Card>
		</dialog>
	)
}
