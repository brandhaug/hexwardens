import { type ReadonlyData } from '../type-utils'
import { type Unit, type UnitState, type UnitStats } from '../domains/unit'

export function canUnitAttack(
	unitState: ReadonlyData<UnitState> | undefined,
	unit: Unit,
	stats: UnitStats = unit.stats
): unitState is ReadonlyData<UnitState> {
	if (
		!unitState ||
		unitState.mode === 'acted' ||
		unitState.mode === 'retreat'
	) {
		return false
	}
	if (unitState.mode === 'moved' && !stats.canAttackAfterMove) {
		return false
	}
	return true
}

export function canUnitCapture(
	unitState: ReadonlyData<UnitState> | undefined,
	unit: Unit
): unitState is ReadonlyData<UnitState> {
	if (
		!unitState ||
		unitState.mode === 'acted' ||
		unitState.mode === 'retreat'
	) {
		return false
	}
	if (unitState.mode === 'moved' && !unit.stats.canCaptureAfterMove) {
		return false
	}
	return true
}

export function canUnitExplore(
	unitState: ReadonlyData<UnitState> | undefined
): unitState is ReadonlyData<UnitState> {
	return !!unitState && unitState.mode === 'ready'
}

export function canUnitHeal(
	unitState: ReadonlyData<UnitState> | undefined
): unitState is ReadonlyData<UnitState> {
	return !!unitState && unitState.mode === 'ready'
}

export function canUnitMove(
	unitState: ReadonlyData<UnitState> | undefined
): unitState is ReadonlyData<UnitState> {
	return (
		!!unitState && (unitState.mode === 'ready' || unitState.mode === 'retreat')
	)
}

export function canUnitRecover(
	unitState: ReadonlyData<UnitState> | undefined
): unitState is ReadonlyData<UnitState> {
	return (
		!!unitState && (unitState.mode === 'ready' || unitState.mode === 'moved')
	)
}
