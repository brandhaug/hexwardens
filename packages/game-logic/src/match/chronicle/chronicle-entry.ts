import { type BoardPosition } from '../../board/board'
import { type Tech } from '../../domains/tech'
import { type Tribe } from '../../domains/tribe'

/**
 * Discriminated union of structured entries that make up a Match chronicle —
 * the running log of significant Match events surfaced to Players.
 *
 * Entries are derived deterministically from {@link BroadcastEvent} (turn-pipeline
 * events) and {@link CombatEvent} (per-attack events) so chronicles match
 * regardless of whether they're rebuilt from a replay or accumulated live.
 *
 * Every entry carries an `actorTribe` (whose action triggered the event), an
 * optional `targetTribe` (whose unit/village was affected), an optional Board
 * `position` so the UI can focus the relevant tile, and the `turn` it landed on.
 */
export type ChronicleEntry =
	| ChronicleResearchProgress
	| ChronicleResearchCompleted
	| ChronicleVillageCaptured
	| ChronicleVillageLevelUp
	| ChronicleUnitDefeated
	| ChronicleTurnAdvanced
	| ChronicleGameOver

export type ChronicleResearchProgress = {
	kind: 'researchProgress'
	actorTribe: Tribe
	tech: Tech
	turnsRemaining: number
	turn: number
}

export type ChronicleResearchCompleted = {
	kind: 'researchCompleted'
	actorTribe: Tribe
	tech: Tech
	turn: number
}

export type ChronicleVillageCaptured = {
	kind: 'villageCaptured'
	actorTribe: Tribe
	targetTribe: Tribe | null
	position: BoardPosition
	turn: number
}

export type ChronicleVillageLevelUp = {
	kind: 'villageLevelUp'
	actorTribe: Tribe
	levelUps: number
	turn: number
}

export type ChronicleUnitDefeated = {
	kind: 'unitDefeated'
	actorTribe: Tribe
	targetTribe: Tribe
	position: BoardPosition
	turn: number
}

export type ChronicleTurnAdvanced = {
	kind: 'turnAdvanced'
	actorTribe: Tribe
	turn: number
}

export type ChronicleGameOver = {
	kind: 'gameOver'
	actorTribe: Tribe | null
	turn: number
}

/**
 * Stable identifier assigned by {@link addChronicleEntry}. The `seq` is a
 * monotonic counter scoped to the chronicle — UI uses it as a React key and
 * to compute "since last seen" deltas after a reconnect.
 */
export type ChronicleEntryWithId = ChronicleEntry & { seq: number }

export type Chronicle = {
	readonly entries: readonly ChronicleEntryWithId[]
	readonly nextSeq: number
}

export const emptyChronicle: Chronicle = { entries: [], nextSeq: 1 }
