import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { generateNextUnitId } from '../../../game'
import { freshUnitState } from '../../../units/world-units'
import {
	generalUnitTypes,
	getUnitDisplayName,
	isHeroUnitType,
	unitToUnitStats,
	type Unit
} from '../../../domains/unit'
import { getPlayerState } from '../../../player/player-state'
import { canAfford, hasTechRequirement } from '../../../validation/player'
import {
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeTrain: WorldActionExecutor = (world, context, plan) => {
	const { intent } = plan
	if (intent.kind !== 'train') {
		return 'Invalid train intent'
	}
	const at = intent.at
	const tribe = context.currentPlayerTribe
	const tile = world.tile(at)
	if (!tile) {
		return 'No tile at position'
	}
	if (tile.item?.type !== 'village') {
		return 'Cannot train'
	}
	const allocation = generateNextUnitId(world.metadata().nextUnitId)
	const unit: Unit = {
		id: allocation.unitId,
		type: intent.unit,
		stats: unitToUnitStats[intent.unit],
		tribe
	}
	world.updateTile(at, {
		item: { ...tile.item, population: tile.item.population + 1 }
	})
	world.spawnUnit(
		unit,
		freshUnitState(unit, at, { mode: 'acted', homeVillage: at })
	)
	world.editPlayer(tribe, (draft) => draft.spend(plan.cost.gold))
	world.updateMetadata({ nextUnitId: allocation.nextUnitId })
	return `${getUnitDisplayName(intent.unit)} recruited. Ready next turn.`
}

export function previewTrain(context: ActionContext): ActionPreview[] {
	const { selectedTile, currentPlayerTribe, gameState } = context
	const previews: ActionPreview[] = []

	if (
		selectedTile.item?.type !== 'village' ||
		selectedTile.item.tribe !== currentPlayerTribe ||
		selectedTile.unit
	) {
		return previews
	}

	const playerState = getPlayerState(gameState.playerStates, currentPlayerTribe)
	if (!playerState) {
		return previews
	}

	for (const unitType of generalUnitTypes) {
		const unitStats = unitToUnitStats[unitType]

		if (!hasTechRequirement(playerState, unitStats.requiredTech)) {
			continue
		}

		previews.push({
			actionType: `train-${unitType}`,
			intent: { kind: 'train', at: context.selectedPosition, unit: unitType },
			label: `Train ${getUnitDisplayName(unitType)} (${unitStats.cost} gold)`,
			variant: 'default'
		})
	}

	// Heroes are summoned via the level-5 `special_unit` Village Perk
	// (see `actions/features/select-perk/`), never trained with gold.
	return previews
}

export function planTrain(
	intent: ActionIntent & { kind: 'train' },
	context: ActionContext
): ActionPlan {
	const { gameState, selectedPosition } = context
	const tile =
		gameState.units.board[selectedPosition.r_idx]?.[selectedPosition.q_idx]
	if (tile?.item?.type !== 'village' || tile.unit) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Cannot train unit - village occupied or invalid'
			}
		}
	}

	const village = tile.item
	if (village.population >= village.maxPopulation) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'populationFull',
				detail: 'Cannot train unit - village population is full'
			}
		}
	}

	const unitStats = unitToUnitStats[intent.unit]

	// Heroes are summoned via the `special_unit` Village Perk at level 5,
	// not trained with gold. Per ADR-0001.
	if (isHeroUnitType(intent.unit)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidIntent',
				detail: `${getUnitDisplayName(intent.unit)} can only be summoned via the level-5 special_unit perk`
			}
		}
	}

	const playerState = getPlayerState(
		gameState.playerStates,
		gameState.currentPlayerTribe
	)
	if (!playerState) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'invalidIntent', detail: 'Player state not found' }
		}
	}

	if (
		unitStats.requiredTech &&
		!hasTechRequirement(playerState, unitStats.requiredTech)
	) {
		return {
			kind: 'denied',
			intent,
			reason: { kind: 'missingTech', tech: unitStats.requiredTech }
		}
	}

	const availableMoney = playerState.money
	if (!canAfford(playerState, unitStats.cost)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'insufficientFunds',
				required: unitStats.cost,
				available: availableMoney
			}
		}
	}

	return {
		kind: 'allowed',
		intent,
		cost: { gold: unitStats.cost },
		preview: {
			actionType: `train-${intent.unit}`,
			intent,
			label: `Train ${getUnitDisplayName(intent.unit)} (${unitStats.cost} gold)`,
			variant: 'default'
		}
	}
}
