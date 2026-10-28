import { type ActionContext } from './actions'
import { type ActionDenialReason, type ActionIntent } from './intent'

/** Shared by direct intents and UI enumeration; previews are never authority. */
export function actionAuthority(
	intent: ActionIntent,
	context: ActionContext
): ActionDenialReason | null {
	const {
		selectedTile: tile,
		currentPlayerTribe: tribe,
		gameState,
		selectedPosition
	} = context
	if (
		intent.at.q_idx !== selectedPosition.q_idx ||
		intent.at.r_idx !== selectedPosition.r_idx
	) {
		return {
			kind: 'invalidTarget',
			detail: 'Action position does not match the selected tile'
		}
	}
	switch (intent.kind) {
		case 'train':
		case 'research':
		case 'selectPerk': {
			if (tile.item?.type !== 'village' || tile.item.tribe !== tribe) {
				return {
					kind: 'invalidTarget',
					detail: 'This action requires your own village'
				}
			}
			break
		}
		case 'capture':
		case 'explore':
		case 'heal':
		case 'recover':
		case 'retire': {
			if (tile.unit?.tribe !== tribe) {
				return {
					kind: 'invalidTarget',
					detail: 'This action requires your own unit'
				}
			}
			if (!gameState.units.unitStates[tile.unit.id]) {
				return { kind: 'unitNotReady', detail: 'Unit state is unavailable' }
			}
			if (
				intent.kind === 'capture' &&
				tile.item?.type === 'village' &&
				tile.item.tribe === tribe
			) {
				return { kind: 'invalidTarget', detail: 'You already own this village' }
			}
			break
		}
		case 'build':
		case 'collect':
		case 'upgrade-to-large': {
			if (!context.isWithinVillageRange) {
				return {
					kind: 'invalidTarget',
					detail: 'This tile is outside your territory'
				}
			}
			if (
				tile.item &&
				'tribe' in tile.item &&
				tile.item.tribe !== null &&
				tile.item.tribe !== tribe
			) {
				return {
					kind: 'invalidTarget',
					detail: 'This building belongs to another tribe'
				}
			}
			break
		}
	}
	return null
}
