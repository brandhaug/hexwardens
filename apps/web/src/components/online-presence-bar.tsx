import { useAtomRefresh, useAtomValue } from '@effect/atom-react'
import { Link } from '@tanstack/react-router'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/hooks/use-hydrated'
import { presenceAtom } from '@/lib/atoms'
import { authClient } from '@/lib/auth-client'

const POLL_INTERVAL_MS = 60_000

export function OnlinePresenceBar() {
	const hydrated = useHydrated()
	const result = useAtomValue(presenceAtom)
	const refresh = useAtomRefresh(presenceAtom)

	useEffect(() => {
		const id = setInterval(refresh, POLL_INTERVAL_MS)
		return () => clearInterval(id)
	}, [refresh])

	// SSR never resolves the presence query, so the hydration render must not
	// show a count even if the client query resolved first — see useHydrated.
	const online = hydrated
		? AsyncResult.match(result, {
				onInitial: () => null,
				onSuccess: ({ value }) => Math.max(1, value.online),
				onFailure: () => null
			})
		: null

	return (
		<div
			data-game-chrome
			className='flex min-h-7 w-full items-center gap-3 bg-transparent px-4'
			style={{
				paddingTop: 'max(0.125rem, env(safe-area-inset-top))',
				paddingLeft: 'max(1rem, env(safe-area-inset-left))',
				paddingRight: 'max(1rem, env(safe-area-inset-right))'
			}}
		>
			<AccountControls />
			<div className='ml-auto flex items-center gap-3'>
				{online === null ? null : (
					<span
						className='inline-flex items-center gap-2 text-foreground transition-opacity duration-200 ease-out'
						title={`${online} ${online === 1 ? 'person' : 'people'} connected right now`}
					>
						<span
							aria-hidden='true'
							className='inline-block size-1.5 rounded-full bg-success motion-safe:animate-[hero-pulse_2.4s_ease-in-out_infinite]'
						/>
						<span
							className='font-heading text-xs font-semibold tabular-nums leading-none'
							aria-label={`${online} ${online === 1 ? 'player' : 'players'} online`}
						>
							{online}
						</span>
						<span
							aria-hidden='true'
							className='font-heading text-[0.7rem] font-semibold uppercase leading-none tracking-[0.12em]'
						>
							online
						</span>
					</span>
				)}
			</div>
		</div>
	)
}

function AccountControls() {
	const hydrated = useHydrated()
	const { data: session } = authClient.useSession()
	const username = session?.user.username
	// SSR renders no account controls (client-only session store), so the
	// hydration render must not either — see useHydrated.
	if (!hydrated || !username) {
		return null
	}

	return (
		<div className='flex items-center gap-2'>
			<Link
				to='/profile/$username'
				params={{ username }}
				className='font-heading text-[0.7rem] font-semibold uppercase leading-none tracking-[0.12em] text-foreground transition-colors hover:text-primary'
			>
				{username}
			</Link>
			<Button
				variant='ghost'
				size='xs'
				className='font-heading text-[0.7rem] font-semibold uppercase tracking-[0.12em]'
				onClick={() => void authClient.signOut()}
			>
				Sign Out
			</Button>
		</div>
	)
}
