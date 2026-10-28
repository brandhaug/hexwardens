import { resolveWorldCaptureSetups } from '../actions/features/capture/lifecycle'
import { positionKey } from '../board/position'
import { getTribeVillageRange } from '../board/tribe-range'
import { hasTechPassive } from '../domains/tech'
import { tribes, type Tribe } from '../domains/tribe'
import { getEffectiveMaxHealth } from '../domains/unit'
import { totalVillageSalary } from '../domains/village-income'
import { type GameWorld } from '../engine/world-contract'
import { snapshotFor } from '../fog-of-war/snapshot'
import { sealWorldOutcome } from '../match/outcome'
import { type BroadcastEvent, type PhaseName } from './events'

type TurnRule = (
	world: GameWorld,
	endingTribe: Tribe
) => readonly BroadcastEvent[]

function endOfRound(world: GameWorld): boolean {
	const { currentPlayerTribe, eliminatedTribes } = world.metadata()
	const eliminated = new Set(eliminatedTribes)
	const players = world.players()
	const current = players.findIndex(
		(player) => player.tribe === currentPlayerTribe
	)
	return (
		current !== -1 &&
		players.some((player) => !eliminated.has(player.tribe)) &&
		!players.slice(current + 1).some((player) => !eliminated.has(player.tribe))
	)
}

const salary: TurnRule = (world, tribe) => {
	const amount = totalVillageSalary(world.snapshot(), tribe)
	if (amount === 0) {
		return []
	}
	world.editPlayer(tribe, (player) => player.credit(amount))
	return [{ type: 'salary', tribe, amount }]
}

const techPassives: TurnRule = (world, tribe) => {
	if (
		!hasTechPassive(
			world.player(tribe)?.researchedTechs ?? [],
			'territory_regen'
		)
	) {
		return []
	}
	const territory = getTribeVillageRange(world.snapshot().units.board, tribe)
	for (const { unit, state } of world.units(tribe)) {
		if (!territory.has(positionKey(state.position))) {
			continue
		}
		const maximum = getEffectiveMaxHealth(unit.type, state)
		if (state.health < maximum) {
			world.updateUnit(unit.id, { health: Math.min(maximum, state.health + 2) })
		}
	}
	return []
}

const research: TurnRule = (world, tribe) => {
	const progress = world.player(tribe)?.researchInProgress
	if (!progress) {
		return []
	}
	const turnsRemaining = progress.turnsRemaining - 1
	if (turnsRemaining > 0) {
		world.editPlayer(tribe, (player) => player.tickResearchProgress())
		return [
			{
				type: 'research',
				tribe,
				tech: progress.tech,
				completed: false,
				turnsRemaining
			}
		]
	}
	world.editPlayer(tribe, (player) => player.completeResearch())
	return [{ type: 'research', tribe, tech: progress.tech, completed: true }]
}

const unitReset: TurnRule = (world) => {
	if (endOfRound(world)) {
		for (const { unit } of world.units()) {
			world.updateUnit(unit.id, {
				mode: 'ready',
				killsThisTurn: 0,
				hasBeenAttackedThisTurn: false
			})
		}
	}
	return []
}

const debuffTick: TurnRule = (world) => {
	if (endOfRound(world)) {
		for (const { unit, state } of world.units()) {
			world.updateUnit(unit.id, {
				debuffs: state.debuffs.flatMap((debuff) =>
					debuff.turnsRemaining > 1
						? [{ ...debuff, turnsRemaining: debuff.turnsRemaining - 1 }]
						: []
				)
			})
		}
	}
	return []
}

const explorationCommit: TurnRule = (world) => {
	const tribe = world.metadata().currentPlayerTribe
	const exploration = world.player(tribe)?.exploration ?? {}
	const tiles = [...snapshotFor(world.snapshot(), tribe).visibleTileIds].filter(
		(key) => !exploration[key]
	)
	if (tiles.length > 0) {
		world.editPlayer(tribe, (player) => player.exploreTiles(tiles))
	}
	return []
}

const villageExperienceCommit: TurnRule = (world) => {
	const pending = world.metadata().pendingVillageLevelUps
	if (Object.keys(pending).length === 0) {
		return []
	}
	const events: BroadcastEvent[] = []
	for (const tribe of tribes) {
		const levelUps = pending[tribe]
		if (levelUps && levelUps > 0) {
			events.push({ type: 'villageLevel', tribe, levelUps })
		}
	}
	world.updateMetadata({ pendingVillageLevelUps: {} })
	return events
}

const rotation: TurnRule = (world) => {
	const metadata = world.metadata()
	const players = world.players()
	const eliminated = new Set(metadata.eliminatedTribes)
	const first = players.find((player) => !eliminated.has(player.tribe))
	if (!first) {
		return []
	}
	const current = players.findIndex(
		(player) => player.tribe === metadata.currentPlayerTribe
	)
	const following = players
		.slice(current + 1)
		.find((player) => !eliminated.has(player.tribe))
	const next = current === -1 ? first : (following ?? first)
	const turn = metadata.turn + (current !== -1 && !following ? 1 : 0)
	if (next.tribe === metadata.currentPlayerTribe && turn === metadata.turn) {
		return []
	}
	world.updateMetadata({ currentPlayerTribe: next.tribe, turn })
	return [
		{
			type: 'turnRotated',
			from: metadata.currentPlayerTribe,
			to: next.tribe,
			turn
		}
	]
}

const gameOver: TurnRule = (world) => {
	const wasOver = world.metadata().isGameOver
	sealWorldOutcome(world)
	const { isGameOver, winner } = world.metadata()
	return isGameOver && !wasOver ? [{ type: 'gameOver', winner }] : []
}

export const turnRules: Record<PhaseName, TurnRule> = {
	salary,
	techPassives,
	research,
	unitReset,
	debuffTick,
	explorationCommit,
	villageExperienceCommit,
	rotation,
	captureFlip: (world) => resolveWorldCaptureSetups(world),
	gameOver
}
