import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { awardControllingVillage } from '../../village-rewards'
import { capitalize } from 'lodash-es'
import { Board } from '../../../board/board'
import { type BoardPosition } from '../../../board/position'
import {
	gameEventToCost,
	gameEventToVillageExperience,
	type TileGrid
} from '../../../game'
import {
	isPrimaryBuildingValue,
	type PrimaryBuildingValue
} from '../../../domains/primary-building'
import {
	primaryBuildingToSecondaryBuilding,
	type SecondaryBuildingValue
} from '../../../domains/secondary-building'
import { type Tech } from '../../../domains/tech'
import { type Tribe } from '../../../domains/tribe'
import { getPlayerState } from '../../../player/player-state'
import { canAfford } from '../../../validation/player'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

type BuildVariant =
	| { kind: 'primary'; primaryValue: PrimaryBuildingValue }
	| { kind: 'secondary'; secondaryValue: SecondaryBuildingValue }

const primaryRequiredTech: Record<PrimaryBuildingValue, Tech> = {
	tavern: 'coral_reef',
	farm: 'farming',
	'lumber mill': 'lumber_mill',
	camp: 'camp',
	mine: 'mine'
}
const secondaryRequiredTech: Record<SecondaryBuildingValue, Tech> = {
	dock: 'fish_farm',
	windmill: 'windmill',
	watermill: 'paper_mill',
	stables: 'pasture',
	blacksmith: 'quarry'
}

/** Preview the build button for the action bar. */
export function previewBuild(context: ActionContext): ActionPreview | null {
	const variant = pickBuildVariant(context)
	if (!variant) {
		return null
	}
	if (variant.kind === 'primary') {
		const tile = context.selectedTile
		if (tile.item?.type !== 'primaryBuilding') {
			return null
		}
		return {
			actionType: 'build',
			intent: { kind: 'build', at: context.selectedPosition },
			label: `Build ${tile.item.value}`,
			variant: 'default'
		}
	}
	return {
		actionType: 'build',
		intent: { kind: 'build', at: context.selectedPosition },
		label: `Build ${capitalize(variant.secondaryValue)}`,
		variant: 'default'
	}
}

/** Validate a build intent and return either an allowed plan or a denial. */
export function planBuild(
	intent: ActionIntent & { kind: 'build' },
	context: ActionContext
): ActionPlan {
	const variant = pickBuildVariant(context)
	if (!variant) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'noActionAvailable',
				detail: 'No buildable target on this tile'
			}
		}
	}

	const cost = gameEventToCost.building_built
	const player = getPlayerState(
		context.gameState.playerStates,
		context.gameState.currentPlayerTribe
	)
	const availableMoney = player?.money ?? 0
	if (!canAfford(player, cost)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'insufficientFunds',
				required: cost,
				available: availableMoney
			}
		}
	}

	const requiredTech =
		variant.kind === 'primary'
			? primaryRequiredTech[variant.primaryValue]
			: secondaryRequiredTech[variant.secondaryValue]
	if (!player?.researchedTechs.includes(requiredTech)) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'missingTech', tech: requiredTech }
		}
	}

	const preview = previewBuild(context)
	if (!preview) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'noActionAvailable',
				detail: 'No buildable target on this tile'
			}
		}
	}

	return { kind: 'allowed', intent, cost: { gold: cost }, preview }
}

export const executeBuild: WorldActionExecutor = (world, context, plan) => {
	const at = plan.intent.at
	const tribe = context.currentPlayerTribe
	const tile = world.tile(at)
	if (!tile) {
		return 'No tile at position'
	}
	const variant = pickBuildVariant(context)
	if (!variant) {
		return 'Cannot build here'
	}
	if (variant.kind === 'primary') {
		if (tile.item?.type !== 'primaryBuilding') {
			return 'Cannot build here'
		}
		world.updateTile(at, { item: { ...tile.item, state: 'built', tribe } })
	} else {
		world.updateTile(at, {
			item: {
				type: 'secondaryBuilding',
				value: variant.secondaryValue,
				state: 'built',
				tribe
			}
		})
	}
	world.editPlayer(tribe, (draft) => draft.spend(plan.cost.gold))
	awardControllingVillage(
		world,
		at,
		tribe,
		gameEventToVillageExperience.building_built
	)
	return `${capitalize(variant.kind === 'primary' ? variant.primaryValue : variant.secondaryValue)} built successfully!`
}

function pickBuildVariant(context: ActionContext): BuildVariant | null {
	if (
		canPrimaryBuild(context) &&
		context.selectedTile.item?.type === 'primaryBuilding'
	) {
		return { kind: 'primary', primaryValue: context.selectedTile.item.value }
	}
	const secondary = pickSecondaryValue(context)
	if (secondary !== null) {
		return { kind: 'secondary', secondaryValue: secondary }
	}
	return null
}

function canPrimaryBuild(context: ActionContext): boolean {
	const { selectedTile, isWithinVillageRange } = context
	return (
		selectedTile.item?.type === 'primaryBuilding' &&
		selectedTile.item.state === 'idle' &&
		isWithinVillageRange
	)
}

function pickSecondaryValue(
	context: ActionContext
): SecondaryBuildingValue | null {
	if (
		!isAdjacentToBuildingOfTribe(
			context.selectedPosition,
			context.currentPlayerTribe,
			context
		)
	) {
		return null
	}
	const available = getAvailableSecondaryBuildings(
		context.selectedPosition,
		context.currentPlayerTribe,
		context.gameState.units.board
	)
	const researched = new Set(
		getPlayerState(context.gameState.playerStates, context.currentPlayerTribe)
			?.researchedTechs ?? []
	)
	// Keep the first eligible target when all are locked so planning can
	// explain its missing technology.
	return (
		available.find((value) => researched.has(secondaryRequiredTech[value])) ??
		available[0] ??
		null
	)
}

function getAvailableSecondaryBuildings(
	position: BoardPosition,
	tribe: Tribe,
	tiles: TileGrid
): SecondaryBuildingValue[] {
	const board = Board.from(tiles)
	const availableBuildings = new Set<SecondaryBuildingValue>()

	for (const neighborPos of board.neighborsOf(position)) {
		const neighborTile = board.at(neighborPos)
		if (
			neighborTile?.item?.type === 'primaryBuilding' &&
			neighborTile.item.state === 'built' &&
			neighborTile.item.tribe === tribe &&
			isPrimaryBuildingValue(neighborTile.item.value)
		) {
			const primaryBuilding: PrimaryBuildingValue = neighborTile.item.value
			const secondaryBuilding =
				primaryBuildingToSecondaryBuilding[primaryBuilding]

			if (
				!isPrimaryBuildingAlreadySupporting(
					neighborPos,
					secondaryBuilding,
					board
				)
			) {
				availableBuildings.add(secondaryBuilding)
			}
		}
	}

	return [...availableBuildings]
}

function isPrimaryBuildingAlreadySupporting(
	primaryBuildingPos: BoardPosition,
	secondaryBuildingType: SecondaryBuildingValue,
	board: Board
): boolean {
	return board.neighborsOf(primaryBuildingPos).some((neighborPos) => {
		const neighborTile = board.at(neighborPos)
		return (
			neighborTile?.item?.type === 'secondaryBuilding' &&
			neighborTile.item.value === secondaryBuildingType &&
			['built', 'large'].includes(neighborTile.item.state)
		)
	})
}

function isAdjacentToBuildingOfTribe(
	selectedPosition: BoardPosition,
	currentPlayerTribe: Tribe,
	context: ActionContext
): boolean {
	const board = Board.from(context.gameState.units.board)
	const currentTile = board.at(selectedPosition)
	if (!currentTile || currentTile.item || currentTile.unit) {
		return false
	}

	if (!context.isWithinVillageRange) {
		return false
	}

	return board.neighborsOf(selectedPosition).some((neighborPos) => {
		const neighborTile = board.at(neighborPos)
		return (
			neighborTile?.item?.type === 'primaryBuilding' &&
			neighborTile.item.state === 'built' &&
			neighborTile.item.tribe === currentPlayerTribe
		)
	})
}

export function inspectBuild(context: ActionContext): ActionInspection | null {
	const { selectedTile, selectedPosition, currentPlayerTribe, gameState } =
		context
	const board = Board.from(gameState.units.board)
	const relevant =
		(selectedTile.item?.type === 'primaryBuilding' &&
			selectedTile.item.state === 'idle') ||
		(!selectedTile.item &&
			board.neighborsOf(selectedPosition).some((position) => {
				const item = board.at(position)?.item
				return (
					item?.type === 'primaryBuilding' &&
					item.state === 'built' &&
					item.tribe === currentPlayerTribe
				)
			}))
	if (!relevant) {
		return null
	}
	return {
		intent: { kind: 'build', at: selectedPosition },
		label: 'Build',
		outcome: `Construct the building and add ${gameEventToVillageExperience.building_built} development to its village.`
	}
}
