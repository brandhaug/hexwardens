import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronRight, Swords, Trophy, Users } from 'lucide-react'
import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
	ChunkyButton,
	type ChunkyButtonVariant
} from '@/components/ui/chunky-button'
import { LandingShell } from '@/components/landing-shell'
import { useHydrated } from '@/hooks/use-hydrated'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
	component: MenuComponent
})

function MenuComponent() {
	const navigate = useNavigate()
	const hydrated = useHydrated()
	const { data: session } = authClient.useSession()
	// The server always renders the signed-out state (the session store is
	// client-only), so the hydration render must too — see useHydrated.
	const isAuthenticated = hydrated && !!session?.user

	return (
		<LandingShell>
			{/* On mobile `mt-auto` pushes the CTA cluster down to the bottom of the
			    LandingShell content area (thumb zone). Desktop drops the auto-margin
			    and keeps the cluster vertically centered under the hero. */}
			<div className='mx-auto flex w-full max-w-[440px] flex-col gap-4 mt-auto md:mt-0'>
				<div className='flex flex-row items-center justify-between gap-3 px-1'>
					<span
						className='font-heading text-[0.65rem] uppercase tracking-[0.32em] text-foreground/85'
						style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
					>
						New campaign
					</span>
					{isAuthenticated ? null : (
						<Button
							variant='ghost'
							size='sm'
							onClick={() => void navigate({ to: '/sign-in', search: {} })}
						>
							Sign In
						</Button>
					)}
				</div>
				<div className='flex flex-col gap-3'>
					<MainMenuButton
						variant='gold'
						icon={<Swords className='size-6' aria-hidden='true' />}
						label='Single Player'
						hint='vs. Bots · offline-friendly'
						onClick={() => void navigate({ to: '/single-player' })}
					/>
					<MainMenuButton
						variant='teal'
						icon={<Users className='size-6' aria-hidden='true' />}
						label='Multiplayer'
						hint='Public queue · private lobby'
						onClick={() => void navigate({ to: '/lobby', search: {} })}
					/>
					<MainMenuButton
						variant='ghost'
						icon={<Trophy className='size-5' aria-hidden='true' />}
						label='Leaderboard'
						onClick={() =>
							void navigate({
								to: '/leaderboard',
								search: { sort: 'wins', page: 1 }
							})
						}
					/>
				</div>
			</div>
		</LandingShell>
	)
}

interface MainMenuButtonProps {
	variant: ChunkyButtonVariant
	icon: ReactNode
	label: string
	hint?: string
	onClick: () => void
}

function MainMenuButton({
	variant,
	icon,
	label,
	hint,
	onClick
}: MainMenuButtonProps) {
	let iconWrap = 'bg-foreground/8 text-foreground/85'
	if (variant === 'gold') {
		iconWrap = 'bg-gold-text/10 text-gold-text'
	} else if (variant === 'teal') {
		iconWrap = 'bg-teal-deep/55 text-gold-edge'
	}

	return (
		<ChunkyButton
			variant={variant}
			onClick={onClick}
			// Menu rows are left-aligned icon+label+hint, taller than the default
			// centered CTA — override justification/padding while inheriting the
			// shared chrome, press ramp, and haptic.
			className='justify-start gap-4 px-4 py-4 text-left tracking-normal normal-case md:px-5 md:py-5'
		>
			<span
				aria-hidden='true'
				className={cn(
					'flex size-11 shrink-0 items-center justify-center rounded-md border border-current/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
					iconWrap
				)}
			>
				{icon}
			</span>
			<span className='flex min-w-0 flex-1 flex-col gap-0.5'>
				<span className='font-heading text-base uppercase leading-none tracking-[0.08em] md:text-lg'>
					{label}
				</span>
				{hint && (
					<span className='font-heading text-[0.65rem] uppercase tracking-[0.12em] opacity-75 md:text-xs'>
						{hint}
					</span>
				)}
			</span>
			<ChevronRight
				className='size-5 shrink-0 opacity-65 transition-transform group-hover:translate-x-0.5'
				aria-hidden='true'
			/>
		</ChunkyButton>
	)
}
