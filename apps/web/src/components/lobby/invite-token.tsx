import { Effect, Result } from 'effect'
import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Big copyable invite token. The visual goal is "claim ticket" — large
 * monospaced characters with letter-spacing that read as a board-game card,
 * not a settings field. Tap-to-copy is the primary action; on copy we flash
 * a "Copied" state for ~1.5s without resorting to celebratory animations
 * (the design guide asks us not to introduce juice).
 */
export function InviteToken({ code }: { code: string }) {
	const [copied, setCopied] = useState(false)

	const copy = async () => {
		const result = await Effect.runPromise(
			Effect.result(
				Effect.tryPromise(() => navigator.clipboard.writeText(code))
			)
		)
		if (Result.isFailure(result)) {
			toast.error('Could not copy invite code')
			return
		}
		setCopied(true)
		toast.success('Invite code copied')
		window.setTimeout(() => setCopied(false), 1500)
	}

	return (
		<div className='flex flex-col gap-1'>
			<span className='text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground'>
				Invite code
			</span>
			<button
				type='button'
				onClick={() => void copy()}
				aria-label={`Copy invite code ${code}`}
				className='group flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-card px-3 py-2 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			>
				<span className='font-heading text-2xl tracking-[0.4em] text-primary tabular-nums'>
					{code}
				</span>
				<span className='text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground'>
					{copied ? 'Copied' : 'Copy'}
				</span>
			</button>
		</div>
	)
}
