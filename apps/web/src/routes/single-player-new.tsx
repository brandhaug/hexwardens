import { TribeOpeningPreview } from '@/components/lobby/tribe-opening-preview'
import {
	canFitPlayers,
	mapPlayerCapacity
} from '@hexwardens/game-logic/board/map-capacity'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSelector, useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
	difficulties,
	isDifficulty,
	type Difficulty
} from '@hexwardens/game-logic/difficulty'
import {
	isTribe,
	type Tribe,
	tribes
} from '@hexwardens/game-logic/domains/tribe'
import {
	mapSizes,
	type MapSize,
	type MatchConfig
} from '@hexwardens/game-logic/multiplayer/types'
import { LandingShell } from '@/components/landing-shell'
import { TribeBanner } from '@/components/lobby/tribe-banner'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/single-player-new')({
	component: SinglePlayerNewComponent
})

const numberOfOpponentsOptions = [1, 2, 3, 4]

function isMapSize(value: string): value is MapSize {
	const sizes: readonly string[] = mapSizes
	return sizes.includes(value)
}

interface SinglePlayerFormValues {
	tribe: Tribe
	numberOfOpponents: number
	difficulty: Difficulty
	mapSize: MatchConfig['mapSize']
}

const defaultValues: SinglePlayerFormValues = {
	tribe: tribes[0],
	numberOfOpponents: numberOfOpponentsOptions[0] ?? 1,
	difficulty: difficulties[0],
	mapSize: 'medium'
}

function SinglePlayerNewComponent() {
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const isAuthenticated = !!session?.user
	const [selectedTribe, setSelectedTribe] = useState<Tribe>(tribes[0])

	const form = useForm({
		defaultValues,
		onSubmit: ({ value }) => {
			void navigate({
				to: '/game',
				search: {
					...value,
					playerName: session?.user.username ?? 'Player 1',
					spectator: false,
					fresh: true
				}
			})
		}
	})

	const selectedMapSize = useSelector(
		form.store,
		(state) => state.values.mapSize
	)
	const selectedOpponents = useSelector(
		form.store,
		(state) => state.values.numberOfOpponents
	)

	return (
		<LandingShell tribe={selectedTribe}>
			<div className='mx-auto flex w-full max-w-[620px] flex-col gap-6'>
				<div className='flex flex-row items-center justify-between gap-3'>
					<h2 className='font-heading text-2xl font-semibold tracking-[0.02em]'>
						Single Player
					</h2>
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
				<form
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						void form.handleSubmit()
					}}
					className='flex flex-col gap-6'
				>
					<div className='flex flex-col gap-4'>
						<form.Field name='tribe'>
							{(field) => (
								<div className='flex flex-col gap-2'>
									<Label>Tribe</Label>
									{/* Mirrors the multiplayer lobby's banner grid so a player
									    crossing routes never feels they switched apps. Two
									    columns on phones, three on tablet+, with the saturated
									    tribe hue carrying identity instead of a thin capsule. */}
									<div
										role='radiogroup'
										aria-label='Tribe'
										className='grid grid-cols-2 gap-2 sm:grid-cols-3'
									>
										{tribes.map((t) => (
											<TribeBanner
												key={t}
												tribe={t}
												selected={field.state.value === t}
												disabled={false}
												// No "Claimed" caption — single-player has no seat
												// contest, so the ring alone signals selection.
												selectedLabel={null}
												onSelect={() => {
													if (isTribe(t)) {
														field.handleChange(t)
														setSelectedTribe(t)
													}
												}}
											/>
										))}
									</div>
								</div>
							)}
						</form.Field>
						<TribeOpeningPreview tribe={selectedTribe} />
						<form.Field name='numberOfOpponents'>
							{(field) => (
								<div className='flex flex-col gap-2'>
									<Label>Opponents</Label>
									<p className='text-xs text-muted-foreground'>
										{selectedMapSize} maps support up to{' '}
										{mapPlayerCapacity[selectedMapSize]} players, including you.
									</p>

									<ToggleGroup
										aria-label='Number of opponents'
										value={[String(field.state.value)]}
										onValueChange={(values) => {
											const value = values[0]
											if (value) {
												field.handleChange(Number(value))
											}
										}}
										className='grid w-full grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-1'
									>
										{numberOfOpponentsOptions.map((s) => (
											<ToggleGroupItem
												key={s}
												value={String(s)}
												aria-label={`${s} opponents`}
												disabled={!canFitPlayers(selectedMapSize, s + 1)}
												className='min-h-11 w-full sm:min-h-9 sm:w-[60px] sm:flex-none'
											>
												{s}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</div>
							)}
						</form.Field>
						<form.Field name='mapSize'>
							{(field) => (
								<div className='flex flex-col gap-2'>
									<Label>Map size</Label>
									<ToggleGroup
										aria-label='Map size'
										value={[field.state.value]}
										onValueChange={(values) => {
											const value = values[0]
											if (value && isMapSize(value)) {
												field.handleChange(value)
											}
										}}
										className='grid w-full grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-1'
									>
										{mapSizes.map((size) => (
											<ToggleGroupItem
												key={size}
												value={size}
												aria-label={`${size} map`}
												disabled={!canFitPlayers(size, selectedOpponents + 1)}
												className='min-h-11 w-full capitalize sm:min-h-9 sm:w-[100px] sm:flex-none'
											>
												{size}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</div>
							)}
						</form.Field>
						<form.Field name='difficulty'>
							{(field) => (
								<div className='flex flex-col gap-2'>
									<Label>Difficulty</Label>
									{/* 2 cols on phone (three rows, last cell wide) so the long
									    names ("Intermediate", "Advanced") never wrap or truncate.
									    Tablet+ falls back to the flex-wrap row. */}
									<ToggleGroup
										aria-label='Difficulty'
										value={[field.state.value]}
										onValueChange={(values) => {
											const value = values[0]
											if (value && isDifficulty(value)) {
												field.handleChange(value)
											}
										}}
										className='grid w-full grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-1'
									>
										{difficulties.map((d) => (
											<ToggleGroupItem
												key={d}
												value={d}
												aria-label={d}
												className='min-h-11 w-full capitalize sm:min-h-9 sm:w-[100px] sm:flex-none'
											>
												{d}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</div>
							)}
						</form.Field>
					</div>
					<div className='flex gap-2 pt-2'>
						<Button
							type='button'
							variant='outline'
							onClick={() => void navigate({ to: '/' })}
						>
							Back
						</Button>
						<Button type='submit' className='flex-1' size='lg'>
							Start match
						</Button>
					</div>
				</form>
			</div>
		</LandingShell>
	)
}
