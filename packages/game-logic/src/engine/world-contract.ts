import { type BoardPosition } from '../board/position'
import { type Tribe } from '../domains/tribe'
import { type Unit, type UnitId, type UnitState } from '../domains/unit'
import { type GameState } from '../game'
import { type PlayerDraft, type PlayerRead } from '../player/player-state'
import { type TileState } from '../tile/tile'
import { type ReadonlyData } from '../type-utils'

export type WorldMetadata = Omit<GameState, 'units' | 'playerStates'>
export type WorldTile = Omit<TileState, 'unit'>
export type WorldUnit = ReadonlyData<{ unit: Unit; state: UnitState }>

/** A private command workspace. Only detached projections leave this interface. */
export interface GameWorld {
	metadata(): ReadonlyData<WorldMetadata>
	updateMetadata(update: Partial<WorldMetadata>): void
	tile(at: BoardPosition): ReadonlyData<TileState> | null
	tiles(): ReadonlyData<{ at: BoardPosition; tile: TileState }>[]
	updateTile(at: BoardPosition, update: Partial<WorldTile>): void
	player(tribe: Tribe): PlayerRead | undefined
	players(): PlayerRead[]
	editPlayer(tribe: Tribe, edit: (draft: PlayerDraft) => void): void
	unit(id: UnitId): WorldUnit | undefined
	units(tribe?: Tribe): WorldUnit[]
	spawnUnit(unit: Unit, state: UnitState): void
	updateUnit(id: UnitId, update: Partial<UnitState>): void
	moveUnit(id: UnitId, to: BoardPosition): void
	removeUnit(id: UnitId): void
	snapshot(): GameState
}
