import { type ReactNode } from 'react'
import { type Tribe, tribes } from '@hexwardens/game-logic/domains/tribe'
import { LandingHeroShowcase } from '@/components/landing-hero-showcase'
import { Logo } from '@/components/logo'
import { OnlinePresenceBar } from '@/components/online-presence-bar'
import { tribeToMaterialColor } from '@/components/game/board-visual-registry'
import { TribeIcon } from '@/components/game/tribe-icon'
import { cn } from '@/lib/utils'

interface LandingShellProps {
	children: ReactNode
	className?: string
	tribe?: Tribe
}

export function LandingShell({
	children,
	className,
	tribe
}: LandingShellProps) {
	return (
		<div
			data-route='immersive'
			data-game-chrome
			className='relative flex h-dvh w-full flex-col overflow-hidden'
		>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 overflow-hidden'
			>
				<img
					src='/landing-bg.jpg'
					alt=''
					width={1920}
					height={1080}
					decoding='async'
					loading='eager'
					fetchPriority='high'
					className={cn(
						'absolute inset-0 h-full w-full select-none object-cover object-[center_55%]',
						// When a tribe is locked in we swap the static painting for
						// the live R3F board on every viewport — phones included —
						// because the moving hero diorama is the single biggest
						// "this is a real game, not a landing page" cue.
						tribe && 'hidden'
					)}
				/>
				{tribe && (
					<div className='absolute inset-0'>
						<LandingHeroShowcase tribe={tribe} />
					</div>
				)}
				{/* Atmospheric vignette: keeps the hero painterly and pulls
				    focus toward the centered CTAs without a pure black-out. */}
				<div className='absolute inset-0 bg-background/60' />
				<div className='absolute inset-0 bg-linear-to-b from-background/30 via-background/15 to-background' />
				<div
					className='absolute inset-0'
					style={{
						background:
							'radial-gradient(60% 40% at 50% 30%, transparent, oklch(0.18 0.04 222 / 0.45) 90%)'
					}}
				/>
			</div>
			<div className='pointer-events-none absolute inset-x-0 top-0 z-20'>
				<div className='pointer-events-auto'>
					<OnlinePresenceBar />
				</div>
			</div>
			<div className='relative z-10 flex flex-1 overflow-hidden'>
				<section
					className='selectable relative flex w-full justify-center overflow-y-auto'
					style={{
						paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1.75rem))',
						// Bumped from 2rem → 3rem so the bottom CTAs (Start Game,
						// main-menu Single Player) clear the screen edge with room
						// to breathe on phones — `env(safe-area-inset-bottom)` only
						// covers the home indicator, not the visual margin we want.
						paddingBottom: 'max(3rem, calc(env(safe-area-inset-bottom) + 2rem))'
					}}
				>
					<div
						className={cn(
							'flex min-h-full w-full max-w-[720px] flex-col items-center px-5 pt-2 md:px-12 md:pt-3 lg:pt-4',
							className
						)}
					>
						<header className='relative z-10 flex max-w-[34rem] shrink-0 flex-col items-center gap-3 text-center'>
							<div className='flex flex-col items-center'>
								<Logo className='motion-safe:animate-hero-rise mb-1 h-16 w-16 drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)] md:h-20 md:w-20' />
								<span
									className='motion-safe:animate-hero-rise hero-rise-delay-1 font-heading font-semibold text-[0.65rem] uppercase leading-none tracking-[0.3em] text-foreground/85 md:text-xs'
									style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
								>
									Turn-based strategy
								</span>
								<h1
									className='motion-safe:animate-hero-rise hero-rise-delay-2 mt-3 font-heading font-bold uppercase leading-[0.92] tracking-[0.04em] text-primary'
									style={{
										fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
										textShadow:
											'0 1px 0 rgba(255,255,255,0.18), 0 3px 12px rgba(0,0,0,0.55)'
									}}
								>
									Hexwardens
								</h1>
							</div>
							<p
								className='motion-safe:animate-hero-rise hero-rise-delay-3 max-w-[34ch] text-foreground/85'
								style={{
									fontSize: 'clamp(0.95rem, 1.35vw, 1.15rem)',
									lineHeight: 1.55,
									textShadow: '0 1px 6px rgba(0,0,0,0.5)'
								}}
							>
								Lead a tribe across a sunlit hex world.
							</p>
						</header>
						<div className='motion-safe:animate-hero-rise hero-rise-delay-4 relative z-10 flex w-full flex-1 flex-col items-center justify-center-safe pt-8 md:pt-12'>
							{children}
						</div>
					</div>
				</section>
				{!tribe && <TribesOverlay />}
			</div>
		</div>
	)
}

function TribesOverlay() {
	return (
		<div className='motion-safe:animate-hero-rise hero-rise-delay-5 pointer-events-none absolute right-10 bottom-10 z-10 hidden flex-col items-end gap-3 lg:flex'>
			<span className='font-heading text-[0.65rem] font-semibold uppercase leading-none tracking-[0.3em] text-foreground/75'>
				Nine tribes await
			</span>
			<div className='flex items-center gap-2.5'>
				{tribes.map((tribe) => (
					<TribeIcon
						key={tribe}
						tribe={tribe}
						className='size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]'
						style={{ color: tribeToMaterialColor[tribe] }}
					/>
				))}
			</div>
		</div>
	)
}
