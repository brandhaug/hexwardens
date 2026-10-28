import { useAtomValue } from '@effect/atom-react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Effect, Schema } from 'effect'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
	isTribe,
	tribes,
	tribeToColor
} from '@hexwardens/game-logic/domains/tribe'
import { type LeaderboardSort } from '@hexwardens/api/leaderboard'
import { includesValue } from '@hexwardens/game-logic/type-utils'
import { LandingShell } from '@/components/landing-shell'
import { useHydrated } from '@/hooks/use-hydrated'
import { leaderboardAtom } from '@/lib/atoms'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

const leaderboardSorts = ['wins', 'winRate', 'matches'] as const

function isLeaderboardSort(value: string): value is LeaderboardSort {
	return includesValue(leaderboardSorts, value)
}

const searchSchema = Schema.Struct({
	sort: Schema.Literals(leaderboardSorts).pipe(
		Schema.withDecodingDefaultType(Effect.succeed('wins' as const))
	),
	tribe: Schema.optional(Schema.Literals(tribes)),
	page: Schema.Number.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
		Schema.withDecodingDefaultType(Effect.succeed(1))
	)
})

const decodeSearch = Schema.decodeUnknownSync(searchSchema)

export const Route = createFileRoute('/leaderboard')({
	validateSearch: decodeSearch,
	component: LeaderboardComponent
})

const sortLabels: Record<LeaderboardSort, string> = {
	wins: 'Wins',
	winRate: 'Win rate',
	matches: 'Matches'
}

function formatWinRate(winRate: number): string {
	return `${(winRate * 100).toFixed(1)}%`
}

type LeaderboardSearch = {
	readonly sort: LeaderboardSort
	readonly tribe: (typeof tribes)[number] | undefined
	readonly page: number
}

function LeaderboardComponent() {
	const { sort, tribe, page } = Route.useSearch()
	const navigate = useNavigate({ from: '/leaderboard' })
	const hydrated = useHydrated()

	const updateSearch = (patch: Partial<LeaderboardSearch>) => {
		void navigate({
			search: (prev) => ({
				sort: patch.sort ?? prev.sort,
				tribe: 'tribe' in patch ? patch.tribe : prev.tribe,
				page: patch.page ?? 1
			})
		})
	}

	const pagination = { sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
	const query = tribe === undefined ? pagination : { ...pagination, tribe }
	const result = useAtomValue(leaderboardAtom(query))

	const data = hydrated
		? AsyncResult.match(result, {
				onInitial: () => ({
					entries: [],
					total: 0,
					status: 'loading' as const
				}),
				onSuccess: ({ value }) => ({ ...value, status: 'ready' as const }),
				onFailure: () => ({ entries: [], total: 0, status: 'error' as const })
			})
		: { entries: [], total: 0, status: 'loading' as const }

	const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
	const rankOffset = (page - 1) * PAGE_SIZE

	return (
		<LandingShell>
			<Card className='w-full max-w-[720px]'>
				<CardHeader>
					<CardTitle>Leaderboard</CardTitle>
				</CardHeader>
				<CardContent className='space-y-6'>
					<div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
						<div className='flex flex-col gap-2'>
							<span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
								Sort by
							</span>
							<ToggleGroup
								aria-label='Sort by'
								value={[sort]}
								onValueChange={(values) => {
									const value = values[0]
									if (value !== undefined && isLeaderboardSort(value)) {
										updateSearch({ sort: value })
									}
								}}
								className='flex flex-wrap gap-1'
							>
								{leaderboardSorts.map((value) => (
									<ToggleGroupItem
										key={value}
										value={value}
										className='min-h-11 min-w-[96px] sm:min-h-9'
									>
										{sortLabels[value]}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
						<div className='flex flex-col gap-2'>
							<span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
								Tribe
							</span>
							<ToggleGroup
								aria-label='Filter by tribe'
								value={tribe ? [tribe] : []}
								onValueChange={(values) => {
									const value = values[0]
									if (value === undefined) {
										updateSearch({ tribe: undefined })
									} else if (isTribe(value)) {
										updateSearch({ tribe: value })
									}
								}}
								className='flex flex-wrap gap-1'
							>
								{tribes.map((t) => (
									<ToggleGroupItem
										key={t}
										value={t}
										className='min-h-11 min-w-[80px] gap-1.5 capitalize sm:min-h-9'
									>
										<span
											className={cn(
												'h-2.5 w-2.5 shrink-0 rounded-full',
												tribeToColor[t]
											)}
										/>
										{t}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
					</div>

					{data.status === 'loading' && (
						<div className='rounded border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground'>
							Loading…
						</div>
					)}
					{data.status === 'error' && (
						<div className='rounded border border-dashed border-destructive px-4 py-12 text-center text-sm text-destructive'>
							Couldn't load the leaderboard. Try again.
						</div>
					)}
					{data.status === 'ready' && data.entries.length === 0 && (
						<div className='rounded border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground'>
							No ranked matches yet. Be the first on the board.
						</div>
					)}
					{data.status === 'ready' && data.entries.length > 0 && (
						<div className='overflow-x-auto rounded border border-border'>
							<table className='w-full text-sm'>
								<caption className='sr-only'>
									Player leaderboard sorted by {sortLabels[sort]}
									{tribe ? `, filtered to ${tribe}` : ''}
								</caption>
								<thead className='bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground'>
									<tr>
										<th className='px-3 py-2 text-left font-semibold'>#</th>
										<th className='px-3 py-2 text-left font-semibold'>
											Player
										</th>
										<th className='px-3 py-2 text-right font-semibold'>Wins</th>
										<th className='px-3 py-2 text-right font-semibold'>
											Losses
										</th>
										<th className='px-3 py-2 text-right font-semibold'>
											Matches
										</th>
										<th className='px-3 py-2 text-right font-semibold'>
											Win rate
										</th>
									</tr>
								</thead>
								<tbody>
									{data.entries.map((entry, index) => (
										<tr
											key={entry.playerId}
											className='border-t border-border/60 last:border-0'
										>
											<td className='px-3 py-2 font-mono text-muted-foreground'>
												{rankOffset + index + 1}
											</td>
											<td className='px-3 py-2 font-medium'>
												<Link
													to='/profile/$username'
													params={{ username: entry.username }}
													className='text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline'
												>
													{entry.username}
												</Link>
											</td>
											<td className='px-3 py-2 text-right'>{entry.wins}</td>
											<td className='px-3 py-2 text-right text-muted-foreground'>
												{entry.losses}
											</td>
											<td className='px-3 py-2 text-right text-muted-foreground'>
												{entry.matches}
											</td>
											<td className='px-3 py-2 text-right'>
												{formatWinRate(entry.winRate)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					{totalPages > 1 && data.status === 'ready' && (
						<div className='flex items-center justify-between'>
							<span className='text-xs text-muted-foreground'>
								Page {page} of {totalPages} · {data.total} players
							</span>
							<div className='flex gap-2'>
								<Button
									variant='outline'
									size='sm'
									disabled={page <= 1}
									onClick={() => updateSearch({ page: page - 1 })}
								>
									Previous
								</Button>
								<Button
									variant='outline'
									size='sm'
									disabled={page >= totalPages}
									onClick={() => updateSearch({ page: page + 1 })}
								>
									Next
								</Button>
							</div>
						</div>
					)}
				</CardContent>
				<CardFooter>
					<Button
						variant='outline'
						className='h-11 sm:h-9'
						onClick={() => void navigate({ to: '/' })}
					>
						Home
					</Button>
				</CardFooter>
			</Card>
		</LandingShell>
	)
}
