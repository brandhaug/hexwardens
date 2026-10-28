import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type FilteredGameState } from '@hexwardens/game-logic/multiplayer/types'
import { type GameAudioEvent } from './audio-events'

interface BoardSummary {
	totalUnits: number
	unitsByTribe: Map<Tribe, number>
	villagesByTribe: Map<Tribe, number>
	totalVillages: number
}

function summariseBoard(state: FilteredGameState): BoardSummary {
	const unitsByTribe = new Map<Tribe, number>()
	const villagesByTribe = new Map<Tribe, number>()
	let totalUnits = 0
	let totalVillages = 0
	for (const row of state.units.board) {
		for (const tile of row) {
			if (!tile) {
				continue
			}
			if (tile.unit) {
				totalUnits += 1
				const t = tile.unit.tribe
				unitsByTribe.set(t, (unitsByTribe.get(t) ?? 0) + 1)
			}
			if (tile.item?.type === 'village') {
				totalVillages += 1
				const owner = tile.item.tribe
				if (owner) {
					villagesByTribe.set(owner, (villagesByTribe.get(owner) ?? 0) + 1)
				}
			}
		}
	}
	return { totalUnits, unitsByTribe, villagesByTribe, totalVillages }
}

/**
 * Pure derivation: compares the previous and next filtered game states
 * and emits the gameplay-audio events that the broadcast stream cannot
 * carry. Two reasons we keep this on the client side instead of
 * extending `BroadcastEvent`:
 *
 *  1. The same diff fires identically in offline `/game` and online
 *     `/multiplayer-game`, so adding a wire variant would only push the
 *     lowering somewhere else.
 *  2. The diff is already fog-correct: the local player only sees what
 *     they're allowed to see, so combat / capture cues automatically
 *     respect visibility without us re-implementing fog rules.
 *
 * The function is deliberately small — anything more nuanced (per-unit
 * damage tier, tribe-elimination stinger separate from "last village")
 * lives in the broadcast event as a typed payload.
 */
export function deriveStateDiffAudioEvents(
	prev: FilteredGameState,
	next: FilteredGameState,
	localTribe: Tribe | null
): GameAudioEvent[] {
	const before = summariseBoard(prev)
	const after = summariseBoard(next)
	const out: GameAudioEvent[] = []

	// Unit deaths — a strict drop in total unit count. We err on the side
	// of one cue per turn rather than per casualty: combat resolutions
	// already tend to drop multiple units in a single dispatch and a
	// stutter of `unitDeath` cues sounds worse than a single, well-mixed
	// hit. The retrigger window in `audio-manager` enforces the rest.
	if (after.totalUnits < before.totalUnits) {
		const localPlayerInvolved =
			localTribe !== null &&
			(after.unitsByTribe.get(localTribe) ?? 0) <
				(before.unitsByTribe.get(localTribe) ?? 0)
		out.push({ kind: 'unitDeath', localPlayerInvolved })
	}

	// Village captures — a tile flips ownership; we detect it via the
	// villagesByTribe diff. The "capital" version triggers when the
	// capture eliminates the previous owner (their village count goes
	// to zero) and the local player is the new owner. Otherwise the
	// regular `villageCaptured` cue fires.
	for (const [tribe, count] of before.villagesByTribe) {
		const afterCount = after.villagesByTribe.get(tribe) ?? 0
		if (afterCount >= count) {
			continue
		}
		const lostAll = afterCount === 0 && count > 0
		const localCaptured =
			localTribe !== null &&
			(after.villagesByTribe.get(localTribe) ?? 0) >
				(before.villagesByTribe.get(localTribe) ?? 0)
		if (lostAll) {
			out.push({
				kind: 'capitalCaptured',
				capturedByLocalPlayer: localCaptured
			})
		} else {
			out.push({
				kind: 'villageCaptured',
				capturedByLocalPlayer: localCaptured
			})
		}
	}

	// New village standing up (build → built) — a regular village count
	// increase that isn't a capture. The simplest way is to check
	// totalVillages: capture leaves it flat, build raises it.
	if (after.totalVillages > before.totalVillages) {
		const localTribeBuilt =
			localTribe !== null &&
			(after.villagesByTribe.get(localTribe) ?? 0) >
				(before.villagesByTribe.get(localTribe) ?? 0)
		if (localTribeBuilt) {
			out.push({ kind: 'buildComplete', tribe: localTribe })
		}
	}

	return out
}
