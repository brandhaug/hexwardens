import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe, tribes } from '@hexwardens/game-logic/domains/tribe'

import { type UnitId } from '@hexwardens/game-logic/domains/unit'
import { type GameState } from '@hexwardens/game-logic/game'
import { type TileState } from '@hexwardens/game-logic/tile/tile'
import {
	type DamageMoment,
	type GoldGainMoment,
	type HealMoment,
	type Moment,
	type ResearchCompletedMoment,
	type UnitDefeatedMoment,
	type VillageCapturedMoment,
	type VillageLevelUpMoment
} from './moment'

/**
 * Pure diff between two `GameState` snapshots — no DOM, no React, no hooks.
 *
 * The output is a deterministic, ordered list of presentational `Moment`s
 * for the transition from `before` to `after`. A `transitionId` is folded
 * into each moment's id so identical transitions emit different ids on
 * different turns; identical transitions on the same turn emit identical
 * ids, which is what enables idempotent re-mounting in React.
 *
 * This function intentionally consumes only the public `GameState` shape —
 * it does not look at intents, action results, or wire messages, because
 * the multiplayer surface ships only `FilteredGameState` deltas. As a
 * consequence, the diff sees only what the player can see.
 */
export function computeMoments(
	before: GameState,
	after: GameState,
	transitionId: string
): Moment[] {
	const moments: Moment[] = []

	collectUnitMoments(before, after, transitionId, moments)
	collectVillageMoments(before, after, transitionId, moments)
	collectGoldMoments(before, after, transitionId, moments)
	collectResearchMoments(before, after, transitionId, moments)

	return moments
}

interface UnitSnapshot {
	readonly id: UnitId
	readonly tribe: Tribe
	readonly position: BoardPosition
	readonly health: number
}

function indexUnits(state: GameState): Map<UnitId, UnitSnapshot> {
	const result = new Map<UnitId, UnitSnapshot>()
	const board = state.units.board
	for (let r_idx = 0; r_idx < board.length; r_idx++) {
		const row = board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			const unit = tile?.unit
			if (!unit) {
				continue
			}
			const unitState = state.units.unitStates[unit.id]
			if (!unitState) {
				continue
			}
			result.set(unit.id, {
				id: unit.id,
				tribe: unit.tribe,
				position: { q_idx, r_idx },
				health: unitState.health
			})
		}
	}
	return result
}

function collectUnitMoments(
	before: GameState,
	after: GameState,
	transitionId: string,
	out: Moment[]
): void {
	const beforeUnits = indexUnits(before)
	const afterUnits = indexUnits(after)

	for (const [id, prev] of beforeUnits) {
		const next = afterUnits.get(id)
		if (!next) {
			const moment: UnitDefeatedMoment = {
				kind: 'unit-defeated',
				id: `${transitionId}:unit-defeated:${id}`,
				at: prev.position,
				tribe: prev.tribe
			}
			out.push(moment)
			continue
		}
		if (next.health < prev.health) {
			const moment: DamageMoment = {
				kind: 'damage',
				id: `${transitionId}:damage:${id}`,
				at: next.position,
				amount: prev.health - next.health,
				tribe: next.tribe
			}
			out.push(moment)
		} else if (next.health > prev.health) {
			const moment: HealMoment = {
				kind: 'heal',
				id: `${transitionId}:heal:${id}`,
				at: next.position,
				amount: next.health - prev.health,
				tribe: next.tribe
			}
			out.push(moment)
		}
	}
}

interface VillageSnapshot {
	readonly position: BoardPosition
	readonly tribe: Tribe | null
	readonly level: number
}

function indexVillages(state: GameState): Map<string, VillageSnapshot> {
	const result = new Map<string, VillageSnapshot>()
	const board = state.units.board
	for (let r_idx = 0; r_idx < board.length; r_idx++) {
		const row = board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile: TileState | null | undefined = row[q_idx]
			const item = tile?.item
			if (item?.type !== 'village') {
				continue
			}
			const key = `${q_idx},${r_idx}`
			result.set(key, {
				position: { q_idx, r_idx },
				tribe: item.tribe,
				level: item.level
			})
		}
	}
	return result
}

function collectVillageMoments(
	before: GameState,
	after: GameState,
	transitionId: string,
	out: Moment[]
): void {
	const beforeVillages = indexVillages(before)
	const afterVillages = indexVillages(after)

	for (const [key, next] of afterVillages) {
		const prev = beforeVillages.get(key)
		if (!prev) {
			continue
		}
		if (prev.tribe !== next.tribe && next.tribe !== null) {
			const moment: VillageCapturedMoment = {
				kind: 'village-captured',
				id: `${transitionId}:village-captured:${key}`,
				at: next.position,
				tribe: next.tribe
			}
			out.push(moment)
		}
		if (next.level > prev.level && next.tribe !== null) {
			const moment: VillageLevelUpMoment = {
				kind: 'village-level-up',
				id: `${transitionId}:village-level-up:${key}`,
				at: next.position,
				tribe: next.tribe,
				level: next.level
			}
			out.push(moment)
		}
	}
}

function collectGoldMoments(
	before: GameState,
	after: GameState,
	transitionId: string,
	out: Moment[]
): void {
	for (const tribe of tribes) {
		const prev = before.playerStates[tribe]
		const next = after.playerStates[tribe]
		if (!prev || !next) {
			continue
		}
		const delta = next.money - prev.money
		if (delta <= 0) {
			continue
		}
		const anchor = findVillageAnchor(after, tribe)
		if (!anchor) {
			continue
		}
		const moment: GoldGainMoment = {
			kind: 'gold-gain',
			id: `${transitionId}:gold-gain:${tribe}`,
			at: anchor,
			amount: delta,
			tribe
		}
		out.push(moment)
	}
}

function collectResearchMoments(
	before: GameState,
	after: GameState,
	transitionId: string,
	out: Moment[]
): void {
	for (const tribe of tribes) {
		const prev = before.playerStates[tribe]
		const next = after.playerStates[tribe]
		if (!prev || !next) {
			continue
		}
		const prevTechs = new Set(prev.researchedTechs)
		for (const tech of next.researchedTechs) {
			if (prevTechs.has(tech)) {
				continue
			}
			const moment: ResearchCompletedMoment = {
				kind: 'research-completed',
				id: `${transitionId}:research:${tribe}:${tech}`,
				tribe,
				tech
			}
			out.push(moment)
		}
	}
}

/**
 * For tribe-level events that aren't tied to a specific tile (e.g. gold gain
 * from village salaries), anchor the callout to one of that tribe's villages
 * so the player connects the reward to a meaningful piece of geography.
 * Returns `null` if the tribe has no village in the snapshot.
 */
function findVillageAnchor(
	state: GameState,
	tribe: Tribe
): BoardPosition | null {
	const board = state.units.board
	for (let r_idx = 0; r_idx < board.length; r_idx++) {
		const row = board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const tile = row[q_idx]
			if (tile?.item?.type === 'village' && tile.item.tribe === tribe) {
				return { q_idx, r_idx }
			}
		}
	}
	return null
}
