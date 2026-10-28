import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { type Tribe, tribes } from '@hexwardens/game-logic/domains/tribe'
import {
	type SavedMatchRecord,
	type SavedMatchRevision
} from '@hexwardens/game-logic/match/saved-match'
import {
	SavedMatchConflictMenu,
	SavedMatchIncompatibleMenu,
	SavedMatchMenu
} from '@/components/game/saved-match-prompt'
import { LandingShell } from '@/components/landing-shell'
import { authClient } from '@/lib/auth-client'
import { useBrowserSavedMatchLifecycle } from '@/lib/saved-match/use-saved-match-lifecycle'

export const Route = createFileRoute('/single-player')({
	component: SinglePlayerComponent
})

type SavedMatchGate =
	| { readonly kind: 'loading' }
	| { readonly kind: 'continue'; readonly record: SavedMatchRevision }
	| {
			readonly kind: 'conflict'
			readonly local: SavedMatchRecord
			readonly remote: SavedMatchRecord
			readonly recommended: 'local' | 'remote'
	  }
	| { readonly kind: 'incompatible'; readonly record: SavedMatchRecord }

function SinglePlayerComponent() {
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const [gate, setGate] = useState<SavedMatchGate>({ kind: 'loading' })
	const [selectedTribe, setSelectedTribe] = useState<Tribe>(tribes[0])
	const lifecycle = useBrowserSavedMatchLifecycle()

	const loadSavedMatch = useCallback(async () => {
		const result = await lifecycle.load()
		if (result.kind === 'conflict' || result.kind === 'incompatible') {
			setGate(result)
			return
		}
		if (result.kind === 'empty') {
			// No saved match to resume — go straight to fresh-match setup.
			void navigate({ to: '/single-player-new' })
			return
		}
		setSelectedTribe(result.record.playerTribe)
		setGate({ kind: 'continue', record: result.record })
	}, [lifecycle, navigate])

	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect -- This mount effect starts asynchronous loading; the state update is part of the load lifecycle.
		void loadSavedMatch()
	}, [loadSavedMatch])

	const handleBackToMenu = () => {
		void navigate({ to: '/' })
	}

	const handleStartNewMatch = () => {
		void navigate({ to: '/single-player-new' })
	}

	const handleContinue = () => {
		// /game re-reads the local store and continues if it finds one. The
		// search params below are placeholders — when resuming, the route reads
		// tribe / mapSize / etc. from the saved record, not the URL.
		void navigate({
			to: '/game',
			search: {
				tribe: tribes[0],
				mapSize: 'medium',
				numberOfOpponents: 1,
				difficulty: 'Beginner',
				playerName: session?.user.username ?? 'Player 1',
				spectator: false,
				fresh: false
			}
		})
	}

	const resolveConflictWith = async (
		chosen: SavedMatchRecord,
		loser: SavedMatchRecord
	) => {
		const result = await lifecycle.resolveConflict({ chosen, loser })
		if (result.kind === 'conflict') {
			toast.error(
				'Saved Match changed on another device while resolving. Reload to choose again.'
			)
			return
		}
		if (result.kind === 'incompatible') {
			setGate(result)
			return
		}
		setGate({ kind: 'continue', record: result.record })
	}

	return <LandingShell tribe={selectedTribe}>{renderGate()}</LandingShell>

	function renderGate() {
		if (gate.kind === 'loading') {
			return (
				<div className='mx-auto flex w-full max-w-[620px] flex-col gap-6'>
					<h2 className='font-heading text-2xl font-semibold tracking-[0.02em]'>
						Single Player
					</h2>
					<div className='rounded-lg border border-border/70 bg-card/40 px-5 py-6 font-heading text-sm tracking-[0.12em] text-muted-foreground uppercase'>
						Checking for saved match…
					</div>
				</div>
			)
		}
		if (gate.kind === 'continue') {
			return (
				<SavedMatchMenu
					savedMatch={gate.record}
					onContinue={handleContinue}
					onNewMatch={handleStartNewMatch}
					onBack={handleBackToMenu}
				/>
			)
		}
		if (gate.kind === 'conflict') {
			return (
				<SavedMatchConflictMenu
					local={gate.local}
					remote={gate.remote}
					recommended={gate.recommended}
					onUseLocal={() => void resolveConflictWith(gate.local, gate.remote)}
					onUseRemote={() => void resolveConflictWith(gate.remote, gate.local)}
					onBack={handleBackToMenu}
				/>
			)
		}
		return (
			<SavedMatchIncompatibleMenu
				savedMatch={gate.record}
				onStartFresh={handleStartNewMatch}
				onBack={handleBackToMenu}
			/>
		)
	}
}
