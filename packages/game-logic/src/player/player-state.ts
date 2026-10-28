import { Schema } from 'effect'
import { type Difficulty } from '../difficulty'
import { type Tech } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { type ReadonlyData, typedFromEntries } from '../type-utils'

type PlayerId = `player_${string}`

export type ResearchInProgress = {
	tech: Tech
	turnsRemaining: number
}

export type PlayerState = {
	id: PlayerId
	name: string
	tribe: Tribe
	money: number
	exploration: Record<string, true>
	researchedTechs: Tech[]
	researchInProgress: ResearchInProgress | null
	isBot: boolean
	difficulty: Difficulty
}

export type PlayerRead = ReadonlyData<PlayerState>

export type PlayerStateRecord = Partial<Record<Tribe, PlayerState>>

export class UnknownTribeError extends Schema.TaggedError<UnknownTribeError>()(
	'UnknownTribeError',
	{ tribe: Schema.String }
) {}

export class InsufficientFundsError extends Schema.TaggedError<InsufficientFundsError>()(
	'InsufficientFundsError',
	{ tribe: Schema.String, have: Schema.Finite, need: Schema.Finite }
) {}

export class AlreadyResearchedError extends Schema.TaggedError<AlreadyResearchedError>()(
	'AlreadyResearchedError',
	{ tribe: Schema.String, tech: Schema.String }
) {}

export class ResearchAlreadyInProgressError extends Schema.TaggedError<ResearchAlreadyInProgressError>()(
	'ResearchAlreadyInProgressError',
	{ tribe: Schema.String, tech: Schema.String }
) {}

export class NoResearchInProgressError extends Schema.TaggedError<NoResearchInProgressError>()(
	'NoResearchInProgressError',
	{ tribe: Schema.String }
) {}

export function getPlayerState(
	playerStates: ReadonlyData<PlayerStateRecord>,
	tribe: Tribe
): PlayerRead | undefined {
	return playerStates[tribe]
}

export function getActivePlayerStates(
	playerStates: ReadonlyData<PlayerStateRecord>,
	eliminatedTribes: readonly Tribe[]
): PlayerRead[] {
	const eliminated = new Set(eliminatedTribes)
	return Object.values(playerStates).filter(
		(player) => !eliminated.has(player.tribe)
	)
}

export function createInitialPlayerStates(
	tribes: {
		tribe: Tribe
		name: string
		money: number
		isBot: boolean
		difficulty: Difficulty
	}[]
): PlayerStateRecord {
	return typedFromEntries(
		tribes.map(
			(
				{ tribe, name, money, isBot, difficulty },
				index
			): [Tribe, PlayerState] => [
				tribe,
				{
					id: `player_${index + 1}`,
					name,
					tribe,
					money,
					exploration: {},
					researchedTechs: [],
					researchInProgress: null,
					isBot,
					difficulty
				}
			]
		)
	)
}

export function getCurrentPlayerState(
	playerStates: ReadonlyData<PlayerStateRecord>,
	currentTribe: Tribe
): PlayerRead {
	const player = playerStates[currentTribe]
	if (!player) {
		throw new Error(`Player state not found for tribe: ${currentTribe}`)
	}
	return player
}

export interface PlayerDraft {
	spend(amount: number): void
	credit(amount: number): void
	startResearch(tech: Tech, turns: number): void
	tickResearchProgress(amount?: number): void
	completeResearch(): void
	exploreTiles(ids: string[]): void
}

/**
 * Edit a player's state via a mutator callback. Invariants are validated as
 * each helper runs; on violation the helper throws a PlayerStateError and the
 * input record is returned unchanged.
 */
export function editPlayer(
	states: PlayerStateRecord,
	tribe: Tribe,
	mutator: (draft: PlayerDraft) => void
): PlayerStateRecord {
	const player = states[tribe]
	if (!player) {
		throw new UnknownTribeError({ tribe })
	}

	let current: PlayerState = player

	const draft: PlayerDraft = {
		spend(amount) {
			if (current.money - amount < 0) {
				throw new InsufficientFundsError({
					tribe,
					have: current.money,
					need: amount
				})
			}
			current = { ...current, money: current.money - amount }
		},
		credit(amount) {
			current = { ...current, money: current.money + amount }
		},
		startResearch(tech, turns) {
			if (current.researchedTechs.includes(tech)) {
				throw new AlreadyResearchedError({ tribe, tech })
			}
			if (current.researchInProgress) {
				throw new ResearchAlreadyInProgressError({
					tribe,
					tech: current.researchInProgress.tech
				})
			}
			current = {
				...current,
				researchInProgress: { tech, turnsRemaining: turns }
			}
		},
		tickResearchProgress(amount = 1) {
			if (!current.researchInProgress) {
				throw new NoResearchInProgressError({ tribe })
			}
			current = {
				...current,
				researchInProgress: {
					...current.researchInProgress,
					turnsRemaining: current.researchInProgress.turnsRemaining - amount
				}
			}
		},
		completeResearch() {
			if (!current.researchInProgress) {
				throw new NoResearchInProgressError({ tribe })
			}
			if (current.researchedTechs.includes(current.researchInProgress.tech)) {
				throw new AlreadyResearchedError({
					tribe,
					tech: current.researchInProgress.tech
				})
			}
			current = {
				...current,
				researchedTechs: [
					...current.researchedTechs,
					current.researchInProgress.tech
				],
				researchInProgress: null
			}
		},
		exploreTiles(ids) {
			const merged = { ...current.exploration }
			for (const id of ids) {
				merged[id] = true
			}
			current = { ...current, exploration: merged }
		}
	}

	mutator(draft)

	return { ...states, [tribe]: current }
}
