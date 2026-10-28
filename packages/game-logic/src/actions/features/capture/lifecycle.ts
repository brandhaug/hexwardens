import { tribes } from '../../../domains/tribe'
import { type GameState } from '../../../game'
import { createGameWorld } from '../../../engine/world'
import { type GameWorld } from '../../../engine/world-contract'
import { type BroadcastEvent } from '../../../turns/events'
import { pendingChoices } from '../../village-rewards'

export function resolveCaptureSetups(state: GameState) {
	const world = createGameWorld(state)
	const events = resolveWorldCaptureSetups(world)
	return { state: world.snapshot(), events }
}

export function resolveWorldCaptureSetups(
	world: GameWorld
): readonly BroadcastEvent[] {
	const tribe = world.metadata().currentPlayerTribe
	const eliminated = new Set(world.metadata().eliminatedTribes)
	const events: BroadcastEvent[] = []
	let changed = false
	for (const { at } of world.tiles()) {
		const tile = world.tile(at)
		const village = tile?.item
		if (
			village?.type !== 'village' ||
			village.captureSetup?.byTribe !== tribe
		) {
			continue
		}
		changed = true
		if (tile?.unit?.tribe !== tribe) {
			world.updateTile(at, { item: { ...village, captureSetup: null } })
			continue
		}
		const fromTribe = village.tribe
		world.updateTile(at, {
			item: {
				...village,
				tribe,
				population: 0,
				state: 'built',
				captureSetup: null
			}
		})
		for (const { unit, state } of world.units()) {
			if (
				state.homeVillage?.q_idx === at.q_idx &&
				state.homeVillage.r_idx === at.r_idx
			) {
				world.updateUnit(unit.id, { homeVillage: null })
			}
		}
		events.push({ type: 'villageCaptured', byTribe: tribe, fromTribe, at })
		if (
			fromTribe &&
			!eliminated.has(fromTribe) &&
			!world
				.tiles()
				.some(
					({ tile: candidate }) =>
						candidate.item?.type === 'village' &&
						candidate.item.tribe === fromTribe
				)
		) {
			eliminated.add(fromTribe)
			for (const { unit } of world.units(fromTribe)) {
				world.removeUnit(unit.id)
			}
		}
	}
	if (changed) {
		const pending = pendingChoices(world)
		for (const owner of tribes) {
			const choices = pending[owner]
			if (choices) {
				pending[owner] = choices.filter((choice) => {
					const item = world.tile(choice.villagePosition)?.item
					return item?.type === 'village' && item.tribe === owner
				})
			}
		}
		world.updateMetadata({
			pendingPerkChoices: pending,
			eliminatedTribes: [...eliminated]
		})
	}
	return events
}
