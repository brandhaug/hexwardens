import { Predicate } from 'effect'
import { useAtomValue } from '@effect/atom-react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import {
	tribes,
	tribeToColor,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import { type PlayerCosmeticsResponse } from '@hexwardens/api/cosmetics'
import {
	type MatchHistoryEntry,
	type PlayerProfile,
	type TribeStats as ApiTribeStats
} from '@hexwardens/api/profile'
import { AchievementsGallery } from '@/components/achievements-gallery'
import { LandingShell } from '@/components/landing-shell'
import { Button } from '@/components/ui/button'
import {
	emptyProgress,
	progressFromUnlocks,
	type AchievementProgress
} from '@/lib/achievement-progress'
import { achievementsAtom, cosmeticsAtom, profileAtom } from '@/lib/atoms'
import { authClient } from '@/lib/auth-client'
import { unlockGroup } from '@/lib/cosmetic-groups'
import { formatAbsolute, formatRelative } from '@/lib/format-date'
import { cn } from '@/lib/utils'

type ServerProfile = PlayerProfile

export type TribeStats = ApiTribeStats

type CosmeticUnlock = PlayerCosmeticsResponse['unlocks'][number]

type PlayerCosmetics = PlayerCosmeticsResponse

const isNotFound = (error: unknown): boolean =>
	Predicate.hasProperty(error, '_tag') && error._tag === 'PlayerNotFoundError'

export const Route = createFileRoute('/profile/$username')({
	component: ProfileRoute
})

function ProfileRoute() {
	const params = Route.useParams()
	const profileResult = useAtomValue(profileAtom(params.username))
	const achievementsResult = useAtomValue(achievementsAtom(params.username))
	const cosmeticsResult = useAtomValue(cosmeticsAtom(params.username))

	const profileBranch = AsyncResult.match(profileResult, {
		onInitial: () => ({ status: 'loading' as const }),
		onSuccess: ({ value }) => ({ status: 'ready' as const, value }),
		onFailure: ({ cause }) =>
			isNotFound(cause)
				? { status: 'not-found' as const }
				: { status: 'error' as const }
	})

	if (profileBranch.status === 'loading') {
		return <LoadingView />
	}
	if (profileBranch.status === 'not-found') {
		return <NotFoundView username={params.username} />
	}
	if (profileBranch.status === 'error') {
		return <ErrorView />
	}

	const achievements: AchievementProgress = AsyncResult.match(
		achievementsResult,
		{
			onInitial: () => emptyProgress(params.username),
			onSuccess: ({ value }) =>
				progressFromUnlocks(value.username, value.unlocks),
			onFailure: () => emptyProgress(params.username)
		}
	)

	const cosmetics: PlayerCosmetics | null = AsyncResult.match(cosmeticsResult, {
		onInitial: () => null,
		onSuccess: ({ value }) => value,
		onFailure: () => null
	})

	return (
		<ProfileView
			profile={profileBranch.value.profile}
			matches={profileBranch.value.recentMatches}
			achievements={achievements}
			cosmetics={cosmetics}
		/>
	)
}

type ProfileViewProps = {
	profile: ServerProfile
	matches: readonly MatchHistoryEntry[]
	achievements: AchievementProgress
	cosmetics: PlayerCosmetics | null
}

function ProfileView({
	profile,
	matches,
	achievements,
	cosmetics
}: ProfileViewProps) {
	const { data: session } = authClient.useSession()
	const isSelf = session?.user.username === profile.user.username

	const overall = profile.overallStats
	const rank = rankEpithet(overall.matches)
	const favouriteTribe = pickFavouriteTribe(profile.tribeStats)
	const tribeRows = buildTribeRows(profile.tribeStats)

	return (
		<LandingShell>
			<main className='w-full max-w-[900px] space-y-10 px-1 md:space-y-14'>
				<nav className='flex items-center justify-between text-xs uppercase tracking-[0.22em] text-muted-foreground'>
					<Link
						to='/leaderboard'
						search={{ sort: 'wins', page: 1 }}
						className='transition-colors hover:text-primary'
					>
						← Leaderboard
					</Link>
					{isSelf ? (
						<span className='border border-primary/40 bg-primary/5 px-2 py-1 text-primary'>
							Your profile
						</span>
					) : null}
				</nav>

				<header className='space-y-4'>
					<p className='text-xs uppercase tracking-[0.4em] text-muted-foreground/80'>
						Player profile
					</p>
					<h1 className='break-words font-heading text-4xl font-semibold uppercase tracking-wide text-foreground md:text-6xl'>
						{profile.user.username}
					</h1>
					<p className='flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-lg italic text-muted-foreground'>
						<span>{rank}</span>
						{favouriteTribe ? (
							<>
								<span aria-hidden='true' className='text-primary/60'>
									·
								</span>
								<span className='text-xs uppercase not-italic tracking-[0.18em] text-foreground/70'>
									Sworn to
								</span>
								<span className='inline-flex items-center gap-2 not-italic'>
									<span
										className={cn(
											'h-2.5 w-2.5 shrink-0 rounded-full',
											tribeToColor[favouriteTribe.tribe]
										)}
										aria-hidden='true'
									/>
									<span className='capitalize text-foreground'>
										{favouriteTribe.tribe}
									</span>
								</span>
							</>
						) : null}
					</p>
				</header>

				<StatsRibbon
					wins={overall.wins}
					losses={overall.losses}
					matches={overall.matches}
					winRate={overall.winRate}
				/>
				<TribeMastery rows={tribeRows} />
				{cosmetics ? <ChronicleHonours cosmetics={cosmetics} /> : null}
				<RecentCampaigns matches={matches} isSelf={isSelf} />
				<AchievementsGallery progress={achievements} showUnlockDates={isSelf} />
			</main>
		</LandingShell>
	)
}

function StatsRibbon({
	wins,
	losses,
	matches,
	winRate
}: {
	wins: number
	losses: number
	matches: number
	winRate: number
}) {
	return (
		<section
			aria-labelledby='overall-stats'
			className='border-y border-border/70 bg-card/40 py-6 md:py-8'
		>
			<h2 id='overall-stats' className='sr-only'>
				Overall record
			</h2>
			<dl className='grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4'>
				<StatCell label='Victories' value={wins} emphasis />
				<StatCell label='Defeats' value={losses} />
				<StatCell label='Matches' value={matches} />
				<StatCell label='Win rate' value={formatPercent(winRate)} />
			</dl>
		</section>
	)
}

function StatCell({
	label,
	value,
	emphasis
}: {
	label: string
	value: number | string
	emphasis?: boolean
}) {
	return (
		<div className='flex flex-col gap-1.5'>
			<dt className='text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground'>
				{label}
			</dt>
			<dd
				className={cn(
					'font-heading text-3xl font-semibold tabular-nums md:text-4xl',
					emphasis ? 'text-primary' : 'text-foreground'
				)}
			>
				{value}
			</dd>
		</div>
	)
}

type TribeRow = TribeStats

function TribeMastery({ rows }: { rows: TribeRow[] }) {
	return (
		<section className='space-y-5'>
			<SectionHeading title='Tribe mastery' caption='Performance by tribe' />
			<ul className='grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2'>
				{rows.map((row) => (
					<TribeMasteryRow key={row.tribe} row={row} />
				))}
			</ul>
		</section>
	)
}

function TribeMasteryRow({ row }: { row: TribeRow }) {
	const pct = Math.round(row.winRate * 100)
	return (
		<li className='grid grid-cols-[auto_1fr_auto] items-center gap-x-4 py-2'>
			<span
				aria-hidden='true'
				className={cn('h-3 w-3 rounded-full', tribeToColor[row.tribe])}
			/>
			<div className='flex min-w-0 flex-col gap-1.5'>
				<div className='flex items-baseline justify-between gap-3'>
					<span className='font-heading text-sm uppercase tracking-[0.14em] text-foreground/90'>
						{row.tribe}
					</span>
					<span className='font-sans text-xs italic text-muted-foreground'>
						{row.wins} / {row.matches}
					</span>
				</div>
				<div
					className='relative h-1.5 w-full overflow-hidden bg-border/60'
					role='progressbar'
					aria-valuenow={pct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={`${row.tribe} win rate`}
				>
					<div
						className='h-full w-full origin-left bg-primary/80 transition-transform duration-500 motion-reduce:transition-none'
						style={{ transform: `scaleX(${pct / 100})` }}
					/>
				</div>
			</div>
			<span className='min-w-[3ch] text-right font-heading text-sm tabular-nums text-foreground/80'>
				{pct}%
			</span>
		</li>
	)
}

type HonourGroup = {
	readonly key: 'rank' | 'banner' | 'tribe'
	readonly title: string
	readonly caption: string
	readonly unlocks: ReadonlyArray<CosmeticUnlock>
}

function ChronicleHonours({ cosmetics }: { cosmetics: PlayerCosmetics }) {
	const groups = groupHonours(cosmetics.unlocks)
	const earnedTotal = cosmetics.unlocks.filter((u) => u.unlocked).length
	const total = cosmetics.unlocks.length

	return (
		<section
			aria-labelledby='profile-cosmetics'
			className='space-y-5'
			data-testid='chronicle-honours'
		>
			<SectionHeading
				title='Cosmetics'
				caption={`${earnedTotal} of ${total} earned`}
			/>
			<div className='space-y-8'>
				{groups.map((group) => (
					<HonourGroupView key={group.key} group={group} />
				))}
			</div>
			<p className='text-xs italic text-muted-foreground'>
				Cosmetics change appearance only. They do not affect matches.
			</p>
		</section>
	)
}

function HonourGroupView({ group }: { group: HonourGroup }) {
	if (group.unlocks.length === 0) {
		return null
	}
	return (
		<div className='space-y-3'>
			<header className='flex items-baseline justify-between gap-3'>
				<h3 className='font-heading text-sm uppercase tracking-[0.18em] text-foreground/90'>
					{group.title}
				</h3>
				<p className='text-xs italic text-muted-foreground'>{group.caption}</p>
			</header>
			<ul className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
				{group.unlocks.map((unlock) => (
					<HonourCard key={unlock.id} unlock={unlock} />
				))}
			</ul>
		</div>
	)
}

function HonourCard({ unlock }: { unlock: CosmeticUnlock }) {
	return (
		<li
			className={cn(
				'flex items-start gap-3 border border-border/70 bg-card/40 p-3',
				!unlock.unlocked && 'opacity-50'
			)}
			data-testid='honour-card'
			data-unlocked={unlock.unlocked ? 'true' : 'false'}
			aria-label={`${unlock.name} — ${unlock.unlocked ? 'earned' : 'locked'}`}
		>
			<span
				aria-hidden='true'
				className={cn(
					'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
					unlock.tribe ? tribeToColor[unlock.tribe] : 'bg-primary/70'
				)}
			/>
			<div className='flex min-w-0 flex-col gap-1'>
				<div className='flex items-baseline justify-between gap-3'>
					<span className='font-heading text-xs uppercase tracking-[0.14em] text-foreground'>
						{unlock.name}
					</span>
					<span
						className={cn(
							'shrink-0 text-[0.65rem] uppercase tracking-[0.2em]',
							unlock.unlocked ? 'text-primary' : 'text-muted-foreground'
						)}
					>
						{unlock.unlocked ? 'Earned' : 'Locked'}
					</span>
				</div>
				<p className='font-sans text-xs italic text-muted-foreground'>
					{unlock.description}
				</p>
			</div>
		</li>
	)
}

function groupHonours(
	unlocks: ReadonlyArray<CosmeticUnlock>
): ReadonlyArray<HonourGroup> {
	const ranks: CosmeticUnlock[] = []
	const banners: CosmeticUnlock[] = []
	const tribeBadges: CosmeticUnlock[] = []
	for (const unlock of unlocks) {
		switch (unlockGroup(unlock.id)) {
			case 'rank': {
				ranks.push(unlock)
				break
			}
			case 'banner': {
				banners.push(unlock)
				break
			}
			case 'tribe': {
				tribeBadges.push(unlock)
				break
			}
			case 'other': {
				break
			}
		}
	}

	const earnedFirst = (a: CosmeticUnlock, b: CosmeticUnlock) => {
		if (a.unlocked !== b.unlocked) {
			return a.unlocked ? -1 : 1
		}
		return a.name.localeCompare(b.name)
	}

	return [
		{
			key: 'rank',
			title: 'Player rank',
			caption: 'Earned by completing matches',
			unlocks: [...ranks].toSorted(earnedFirst)
		},
		{
			key: 'banner',
			title: 'Victory cosmetics',
			caption: 'Earned by winning matches',
			unlocks: [...banners].toSorted(earnedFirst)
		},
		{
			key: 'tribe',
			title: 'Tribe mastery',
			caption: 'Earned by playing each tribe',
			unlocks: [...tribeBadges].toSorted(earnedFirst)
		}
	]
}

function RecentCampaigns({
	matches,
	isSelf
}: {
	matches: readonly MatchHistoryEntry[]
	isSelf: boolean
}) {
	const navigate = useNavigate()
	return (
		<section className='space-y-5 pb-12'>
			<SectionHeading
				title='Recent matches'
				caption='Completed matches, newest first'
			/>
			{matches.length === 0 ? (
				<div className='flex flex-col items-center gap-4 border border-dashed border-border py-10 text-center'>
					<p className='font-sans italic text-muted-foreground'>
						{isSelf
							? 'You have not completed a match yet.'
							: 'This player has not completed a match yet.'}
					</p>
					{isSelf ? (
						<Button onClick={() => void navigate({ to: '/' })}>
							Start a match
						</Button>
					) : null}
				</div>
			) : (
				<ol className='divide-y divide-border/70 border-y border-border/70'>
					{matches.map((match) => (
						<CampaignRow key={match.matchId} match={match} />
					))}
				</ol>
			)}
		</section>
	)
}

function CampaignRow({ match }: { match: MatchHistoryEntry }) {
	const relative = formatRelative(match.completedAt)
	const absolute = formatAbsolute(match.completedAt)
	return (
		<li className='flex items-center gap-4 py-3 md:gap-6'>
			<span
				aria-hidden='true'
				className={cn(
					'font-heading text-xs uppercase tracking-[0.3em]',
					match.isWinner ? 'text-primary' : 'text-muted-foreground'
				)}
			>
				{match.isWinner ? 'Victory' : 'Defeat'}
			</span>
			<span
				aria-hidden='true'
				className={cn(
					'h-2 w-2 shrink-0 rounded-full',
					tribeToColor[match.tribe]
				)}
			/>
			<span className='font-sans text-sm capitalize text-foreground/90'>
				{match.tribe}
			</span>
			<span className='ml-auto shrink-0 text-right font-sans text-xs italic text-muted-foreground'>
				<time dateTime={match.completedAt} title={absolute}>
					{relative}
				</time>
			</span>
		</li>
	)
}

function SectionHeading({
	title,
	caption
}: {
	title: string
	caption: string
}) {
	return (
		<div className='flex items-end justify-between gap-4 border-b border-border/70 pb-3'>
			<h2 className='font-heading text-xl font-semibold uppercase tracking-[0.18em] text-foreground md:text-2xl'>
				{title}
			</h2>
			<p className='hidden text-xs italic text-muted-foreground sm:block'>
				{caption}
			</p>
		</div>
	)
}

function LoadingView() {
	return (
		<LandingShell>
			<main className='w-full max-w-[680px] space-y-8 px-1 text-center'>
				<p className='font-heading text-xs uppercase tracking-[0.4em] text-muted-foreground/70'>
					Loading profile…
				</p>
			</main>
		</LandingShell>
	)
}

function ErrorView() {
	const navigate = useNavigate()
	return (
		<LandingShell>
			<main className='w-full max-w-[680px] space-y-8 px-1 text-center'>
				<p className='font-heading text-xs uppercase tracking-[0.4em] text-destructive/80'>
					Couldn't load profile
				</p>
				<p className='mx-auto max-w-[46ch] font-sans italic text-muted-foreground'>
					The profile service is unavailable. Try again in a moment.
				</p>
				<Button onClick={() => void navigate({ to: '/' })}>Return home</Button>
			</main>
		</LandingShell>
	)
}

function NotFoundView({ username }: { username: string }) {
	const navigate = useNavigate()
	return (
		<LandingShell>
			<main className='w-full max-w-[680px] space-y-8 px-1 text-center'>
				<p className='font-heading text-xs uppercase tracking-[0.4em] text-primary/70'>
					Profile not found
				</p>
				<h1 className='font-heading text-3xl font-semibold uppercase tracking-wide text-foreground md:text-5xl'>
					No player named
					<br />
					<span className='italic text-muted-foreground'>“{username}”</span>
				</h1>
				<p className='mx-auto max-w-[46ch] font-sans italic text-muted-foreground'>
					Check the spelling, or try the leaderboard. New profiles appear after
					the player completes a match.
				</p>
				<div className='flex justify-center gap-3 pt-2'>
					<Button
						variant='outline'
						onClick={() =>
							void navigate({
								to: '/leaderboard',
								search: { sort: 'wins', page: 1 }
							})
						}
					>
						View leaderboard
					</Button>
					<Button onClick={() => void navigate({ to: '/' })}>
						Return home
					</Button>
				</div>
			</main>
		</LandingShell>
	)
}

function rankEpithet(matches: number): string {
	if (matches === 0) {
		return 'Unblooded'
	}
	if (matches < 5) {
		return 'Initiate'
	}
	if (matches < 15) {
		return 'Warrior'
	}
	if (matches < 50) {
		return 'Captain'
	}
	return 'Warlord'
}

function pickFavouriteTribe(stats: readonly TribeStats[]): TribeStats | null {
	if (stats.length === 0) {
		return null
	}
	let best: TribeStats | undefined
	for (const s of stats) {
		if (best === undefined) {
			best = s
			continue
		}
		if (s.matches > best.matches) {
			best = s
			continue
		}
		if (s.matches === best.matches && s.wins > best.wins) {
			best = s
		}
	}
	return best ?? null
}

function buildTribeRows(stats: readonly TribeStats[]): TribeRow[] {
	const byTribe = new Map<Tribe, TribeStats>()
	for (const s of stats) {
		byTribe.set(s.tribe, s)
	}
	const rows: TribeRow[] = tribes.map((tribe) => {
		const found = byTribe.get(tribe)
		if (found) {
			return found
		}
		return {
			tribe,
			wins: 0,
			losses: 0,
			matches: 0,
			winRate: 0
		}
	})
	return rows.toSorted((a, b) => {
		if (a.matches !== b.matches) {
			return b.matches - a.matches
		}
		if (a.winRate !== b.winRate) {
			return b.winRate - a.winRate
		}
		return a.tribe.localeCompare(b.tribe)
	})
}

function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(0)}%`
}
