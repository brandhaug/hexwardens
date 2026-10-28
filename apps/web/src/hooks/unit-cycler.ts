import { useLayoutEffect, useCallback, useMemo, useRef, useState } from 'react'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type UnitId } from '@hexwardens/game-logic/domains/unit'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	type ActionableUnit,
	selectActionableUnits
} from '@hexwardens/game-logic/player/actionable-units'

export type CycleDirection = 'next' | 'previous'

export interface CycleStepInput {
	readonly actionable: readonly ActionableUnit[]
	readonly currentUnitId: UnitId | null
	readonly passed: ReadonlySet<UnitId>
	readonly direction: CycleDirection
}

/**
 * Pure cycler step. Given the actionable list (already sorted deterministically
 * by {@link selectActionableUnits}), the currently-selected unit, and the set
 * of "passed" unit ids, return the next/previous candidate — or `null` when
 * the list is empty (after filtering passed units).
 *
 * Wraps modularly: stepping past the end (or before the start) returns to the
 * other side of the list. If `currentUnitId` is no longer in the list, the
 * cycle starts at the first eligible unit so the user always lands somewhere.
 */
export function cycleStep(input: CycleStepInput): ActionableUnit | null {
	const eligible = input.actionable.filter(
		(entry) => !input.passed.has(entry.unit.id)
	)
	if (eligible.length === 0) {
		return null
	}

	const currentIndex =
		input.currentUnitId === null
			? -1
			: eligible.findIndex((entry) => entry.unit.id === input.currentUnitId)

	if (currentIndex === -1) {
		return input.direction === 'next'
			? (eligible[0] ?? null)
			: (eligible.at(-1) ?? null)
	}

	const offset = input.direction === 'next' ? 1 : -1
	const nextIndex = (currentIndex + offset + eligible.length) % eligible.length
	return eligible[nextIndex] ?? null
}

export interface UseUnitCyclerArgs {
	readonly gameState: GameState
	readonly tribe: Tribe
	readonly selectedTile: BoardPosition | null
	readonly onSelect: (position: BoardPosition) => void
}

export interface UnitCyclerApi {
	readonly hasActionable: boolean
	readonly readyUnitCount: number
	readonly cycleNext: () => void
	readonly cyclePrevious: () => void
	readonly markCurrentPassed: () => void
}

/**
 * Owns the per-turn cycler cursor and the "passed" set. Both reset when
 * `gameState.turn` or `gameState.currentPlayerTribe` changes — `passed` is
 * intentionally a UI-layer concept (see PRD #84) and never reaches the server.
 *
 * Pure cycling logic is in {@link cycleStep}; this hook is the thin React
 * shell that wires it to game state, the selected tile, and the host's
 * `onSelect` callback (which drives the viewport pan + tile highlight).
 */
export function useUnitCycler(args: UseUnitCyclerArgs): UnitCyclerApi {
	const { gameState, tribe, selectedTile, onSelect } = args

	const actionable = useMemo(
		() => selectActionableUnits(gameState, tribe),
		[gameState, tribe]
	)

	const [cursor, setCursor] = useState<{
		turn: number
		tribe: Tribe
		viewer: Tribe
		passed: ReadonlySet<UnitId>
	}>(() => ({
		turn: gameState.turn,
		tribe: gameState.currentPlayerTribe,
		viewer: tribe,
		passed: new Set()
	}))
	if (
		cursor.turn !== gameState.turn ||
		cursor.tribe !== gameState.currentPlayerTribe ||
		cursor.viewer !== tribe
	) {
		setCursor({
			turn: gameState.turn,
			tribe: gameState.currentPlayerTribe,
			viewer: tribe,
			passed: new Set()
		})
	}
	const passed = cursor.passed

	// Resolve the currently-selected unit id (if any) from the selected tile,
	// so cycling continues from "wherever the user clicked" rather than from
	// a stale internal cursor.
	const currentUnitId = useMemo<UnitId | null>(() => {
		if (!selectedTile) {
			return null
		}
		const tile = gameState.units.board[selectedTile.r_idx]?.[selectedTile.q_idx]
		const unit = tile?.unit
		if (!unit || unit.tribe !== tribe) {
			return null
		}
		return unit.id
	}, [selectedTile, gameState.units.board, tribe])

	const onSelectRef = useRef(onSelect)
	useLayoutEffect(() => {
		onSelectRef.current = onSelect
	}, [onSelect])

	const step = useCallback(
		(direction: CycleDirection) => {
			const next = cycleStep({
				actionable,
				currentUnitId,
				passed,
				direction
			})
			if (next) {
				onSelectRef.current(next.position)
			}
		},
		[actionable, currentUnitId, passed]
	)

	const cycleNext = useCallback(() => step('next'), [step])
	const cyclePrevious = useCallback(() => step('previous'), [step])

	const markCurrentPassed = useCallback(() => {
		if (!currentUnitId) {
			return
		}
		setCursor((previousCursor) => {
			const previous = previousCursor.passed
			if (previous.has(currentUnitId)) {
				return previousCursor
			}
			const updated = new Set(previous)
			updated.add(currentUnitId)
			return { ...previousCursor, passed: updated }
		})
	}, [currentUnitId])

	const readyUnitCount = useMemo(
		() => actionable.filter((entry) => !passed.has(entry.unit.id)).length,
		[actionable, passed]
	)

	return {
		hasActionable: readyUnitCount > 0,
		readyUnitCount,
		cycleNext,
		cyclePrevious,
		markCurrentPassed
	}
}
