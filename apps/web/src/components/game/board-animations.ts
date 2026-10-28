import { useLayoutEffect, useMemo, useRef } from 'react'
import { type GameState } from '@hexwardens/game-logic/game'
import { useAnimationTrack } from './animation-track'
import {
	boardPositionToWorld,
	type BoardWorldPosition
} from './board-position-to-world'
import { UNIT_MOVE_TWEEN_DURATION_MS } from './unit-move-tween'
import { combatAnimationTiming } from './unit-animation-timing'
import { tileElevation } from './tile-elevation'
import { type ResourceHarvestAnimation } from './resource-harvest'
import {
	isHarvestDestination,
	RESOURCE_HARVEST_DURATION_MS,
	resourceHarvests
} from './resource-harvest-transitions'
import { type UnitAnimationOverride } from './unit-miniature'
import {
	unitCombatOverrides,
	unitDefeatTransitions,
	unitTransitions,
	type UnitCombatOverrideState,
	type UnitDefeatTransition
} from './unit-transitions'

export interface UnitMoveAnimation {
	readonly startedAt: number
	readonly fromWorld: BoardWorldPosition
	readonly toWorld: BoardWorldPosition
}

export interface UseBoardAnimationsInput {
	readonly gameState: GameState
	readonly boardRadius: number
	readonly hexRadius: number
	readonly spacing: number
}

export interface BoardAnimations {
	getUnitMove(unitId: string): UnitMoveAnimation | undefined
	getUnitAnimation(unitId: string): UnitAnimationOverride | undefined
	readonly defeats: readonly UnitDefeatAnimation[]
	readonly harvests: readonly ResourceHarvestAnimation[]
}

export interface UnitDefeatAnimation extends UnitDefeatTransition {
	readonly key: string
	readonly worldPosition: BoardWorldPosition
	readonly animation: UnitAnimationOverride
}

export function useBoardAnimations({
	gameState,
	boardRadius,
	hexRadius,
	spacing
}: UseBoardAnimationsInput): BoardAnimations {
	const board = gameState.units.board
	const prevBoardRef = useRef(board)
	const prevUnitStatesRef = useRef(gameState.units.unitStates)
	const tokenRef = useRef(0)

	const { entries: moveEntries, schedule: scheduleMoves } =
		useAnimationTrack<UnitMoveAnimation>()
	const { entries: unitAnimationEntries, schedule: scheduleUnitAnimations } =
		useAnimationTrack<UnitAnimationOverride>()
	const { entries: defeatEntries, schedule: scheduleDefeats } =
		useAnimationTrack<UnitDefeatAnimation>()
	const { entries: harvestEntries, schedule: scheduleHarvests } =
		useAnimationTrack<ResourceHarvestAnimation>()

	useLayoutEffect(() => {
		const prev = prevBoardRef.current
		const prevUnitStates = prevUnitStatesRef.current
		prevBoardRef.current = board
		prevUnitStatesRef.current = gameState.units.unitStates
		if (prev === board && prevUnitStates === gameState.units.unitStates) {
			return
		}

		const harvested = resourceHarvests(prev, board)
		if (harvested.length > 0) {
			const startedAt = performance.now()
			scheduleHarvests(
				harvested.map((harvest) => {
					const key = `${harvest.position.q_idx}:${harvest.position.r_idx}:${++tokenRef.current}`
					const animation: ResourceHarvestAnimation = {
						...harvest,
						key,
						startedAt,
						worldPosition: boardPositionToWorld({
							position: harvest.position,
							height: tileElevation({
								terrain: harvest.terrain,
								isMountain: false
							}).surfaceY,
							boardRadius,
							hexRadius,
							spacing
						})
					}
					return [key, animation] as const
				}),
				RESOURCE_HARVEST_DURATION_MS
			)
		}

		// Combat overrides share a single override slot per unit; attack-vs-defend
		// precedence (attack wins for counter-attackers) is baked into
		// `unitCombatOverrides`, so we can group by state and schedule each
		// state's slice with its own duration without worrying about overlap.
		const overrides = unitCombatOverrides(
			prevUnitStates,
			gameState.units.unitStates
		)
		const overridesByState = new Map<
			UnitCombatOverrideState,
			Array<(typeof overrides)[number]>
		>()
		for (const override of overrides) {
			const bucket = overridesByState.get(override.state) ?? []
			bucket.push(override)
			overridesByState.set(override.state, bucket)
		}
		for (const [state, bucket] of overridesByState) {
			scheduleUnitAnimations(
				bucket.map((override) => {
					const token = ++tokenRef.current
					return [
						override.unitId,
						{ state, token } satisfies UnitAnimationOverride
					] as const
				}),
				combatAnimationTiming[state].durationMs
			)
		}

		const defeatTransitions = unitDefeatTransitions(prev, board)
		if (defeatTransitions.length > 0) {
			scheduleDefeats(
				defeatTransitions.map((defeat) => {
					const token = ++tokenRef.current
					const key = `${defeat.unit.id}:${token}`
					const animation: UnitDefeatAnimation = {
						...defeat,
						key,
						worldPosition: boardPositionToWorld({
							position: defeat.position,
							boardRadius,
							hexRadius,
							spacing
						}),
						animation: { state: 'death', token }
					}
					return [key, animation] as const
				}),
				combatAnimationTiming.death.durationMs
			)
		}

		const transitions = unitTransitions(prev, board)
		if (transitions.length > 0) {
			const startedAt = performance.now()
			scheduleMoves(
				transitions.map(
					(t) =>
						[
							t.unitId,
							{
								startedAt,
								fromWorld: boardPositionToWorld({
									position: t.from,
									boardRadius,
									hexRadius,
									spacing
								}),
								toWorld: boardPositionToWorld({
									position: t.to,
									boardRadius,
									hexRadius,
									spacing
								})
							}
						] as const
				),
				UNIT_MOVE_TWEEN_DURATION_MS
			)
		}
	}, [
		board,
		gameState.units.unitStates,
		boardRadius,
		hexRadius,
		spacing,
		scheduleMoves,
		scheduleUnitAnimations,
		scheduleDefeats,
		scheduleHarvests
	])

	const defeatList = useMemo(() => [...defeatEntries.values()], [defeatEntries])
	const harvestList = useMemo(
		() =>
			[...harvestEntries.values()].filter(({ position }) =>
				isHarvestDestination(board[position.r_idx]?.[position.q_idx])
			),
		[harvestEntries, board]
	)

	return {
		getUnitMove: (unitId) => moveEntries.get(unitId),
		getUnitAnimation: (unitId) => unitAnimationEntries.get(unitId),
		defeats: defeatList,
		harvests: harvestList
	}
}
