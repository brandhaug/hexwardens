import { type BoardPosition } from '../board/board'
import { type ActionIntent } from '../actions/intent'
import { type UnitId } from '../domains/unit'

export type BotActionPlan =
	| {
			kind: 'move'
			unitId: UnitId
			from: BoardPosition
			to: BoardPosition
	  }
	| {
			kind: 'attack'
			unitId: UnitId
			from: BoardPosition
			target: BoardPosition
	  }
	| {
			kind: 'tileAction'
			action: ActionIntent
	  }
