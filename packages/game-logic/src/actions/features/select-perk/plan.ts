import { type ActionContext, type WorldActionExecutor } from '../../actions'
import { villagePerkToDescription } from '../../../domains/village'
import { Board } from '../../../board/board'
import { positionKey } from '../../../board/position'
import { tribeToTribeStats } from '../../../domains/tribe'
import { unitToUnitStats, type Unit } from '../../../domains/unit'
import { generateNextUnitId } from '../../../game'
import { assertNever } from '../../../type-utils'
import { freshUnitState } from '../../../units/world-units'
import { awardVillageExperience, pendingChoices } from '../../village-rewards'
import {
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from '../../intent'

export const executeSelectPerk: WorldActionExecutor = (
	world,
	context,
	plan
) => {
	const { intent } = plan
	if (intent.kind !== 'selectPerk') {
		return 'Invalid selectPerk intent'
	}
	if (!world.tile(intent.at)) {
		return 'No tile at position'
	}
	const tribe = context.currentPlayerTribe
	const head = world.metadata().pendingPerkChoices[tribe]?.[0]
	if (!head) {
		return 'No pending Perk choice'
	}
	const village = world.tile(head.villagePosition)?.item
	if (village?.type !== 'village') {
		return 'Village no longer exists'
	}
	const perk = intent.perk
	const position = head.villagePosition
	let message: string = villagePerkToDescription[perk].name
	if (perk === 'special_unit' && village.tribe === null) {
		message = 'Cannot summon Hero on a neutral Village'
	} else {
		world.updateTile(position, {
			item: {
				...village,
				perks: [...village.perks, perk],
				maxPopulation:
					village.maxPopulation + (perk === 'increase_population' ? 2 : 0),
				salary: village.salary + (perk === 'extra_money' ? 1 : 0),
				range: village.range + (perk === 'expand_range' ? 1 : 0)
			}
		})
		switch (perk) {
			case 'instant_gold': {
				world.editPlayer(tribe, (draft) => draft.credit(5))
				message = '+5 gold'
				break
			}
			case 'increase_population': {
				message = '+2 unit capacity'
				break
			}
			case 'extra_money': {
				message = '+1 Village salary'
				break
			}
			case 'expand_range': {
				message = '+1 Village range'
				break
			}
			case 'extra_experience': {
				awardVillageExperience(world, position, 3)
				message = '+3 Village experience'
				break
			}
			case 'expand_sight': {
				message = 'Sight expanded'
				if (village.tribe) {
					const board = Board.from(world.snapshot().units.board)
					const tiles = [
						positionKey(position),
						...board.within(position, 2).map(positionKey)
					]
					world.editPlayer(village.tribe, (draft) => draft.exploreTiles(tiles))
					message = 'Explorers reveal the surrounding tiles'
				}
				break
			}
			case 'special_unit': {
				if (!village.tribe) {
					break
				}
				const type = tribeToTribeStats[village.tribe].heroUnit
				const allocation = generateNextUnitId(world.metadata().nextUnitId)
				const unit: Unit = {
					id: allocation.unitId,
					type,
					tribe: village.tribe,
					stats: unitToUnitStats[type]
				}
				world.spawnUnit(unit, freshUnitState(unit, position, { mode: 'acted' }))
				world.updateMetadata({ nextUnitId: allocation.nextUnitId })
				message = `Summoned Hero ${type}`
				break
			}
			default: {
				return assertNever(perk)
			}
		}
	}
	const pending = pendingChoices(world)
	world.updateMetadata({
		pendingPerkChoices: { ...pending, [tribe]: (pending[tribe] ?? []).slice(1) }
	})
	return message
}

/** Pending choices are resolved in FIFO order, at the city that earned them. */
export function previewSelectPerk(context: ActionContext): ActionPreview[] {
	const { gameState, currentPlayerTribe, selectedPosition } = context
	const head = gameState.pendingPerkChoices[currentPlayerTribe]?.[0]
	if (
		!head ||
		head.villagePosition.q_idx !== selectedPosition.q_idx ||
		head.villagePosition.r_idx !== selectedPosition.r_idx
	) {
		return []
	}
	return head.options.map((perk) => ({
		actionType: `selectPerk-${perk}`,
		intent: { kind: 'selectPerk', at: selectedPosition, perk },
		label: `Pick Perk: ${villagePerkToDescription[perk].name}`,
		variant: 'secondary'
	}))
}

export function planSelectPerk(
	intent: ActionIntent & { kind: 'selectPerk' },
	context: ActionContext
): ActionPlan {
	const head =
		context.gameState.pendingPerkChoices[context.currentPlayerTribe]?.[0]
	if (!head) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidIntent',
				detail: 'No pending Perk choice for this Tribe'
			}
		}
	}
	if (
		head.villagePosition.q_idx !== intent.at.q_idx ||
		head.villagePosition.r_idx !== intent.at.r_idx
	) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail: 'Resolve the older Village level-up first'
			}
		}
	}
	if (!head.options.includes(intent.perk)) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidIntent',
				detail: `${intent.perk} is not on offer at level ${head.level}`
			}
		}
	}
	if (
		intent.perk === 'special_unit' &&
		context.gameState.units.board[head.villagePosition.r_idx]?.[
			head.villagePosition.q_idx
		]?.unit
	) {
		return {
			kind: 'denied',
			intent,
			reason: {
				kind: 'invalidTarget',
				detail:
					'Village tile is occupied — move the unit before summoning a Hero'
			}
		}
	}
	return {
		kind: 'allowed',
		intent,
		cost: { gold: 0 },
		preview: {
			actionType: `selectPerk-${intent.perk}`,
			intent,
			label: `Pick Perk: ${villagePerkToDescription[intent.perk].name}`,
			variant: 'secondary'
		}
	}
}
