import { type AchievementId } from '../achievements/registry'
import { type HexCoordinate } from '../board/board'
import { type Tech } from '../domains/tech'
import { type Tribe } from '../domains/tribe'
import { type UnitType } from '../domains/unit'
import { type VillagePerk } from '../domains/village'
import { type Difficulty } from '../difficulty'
import { type FilteredGameState } from '../fog-of-war/schema'
import { type GameAction } from '../game'
import { type MatchId, type PlayerId, type Username } from '../ids'
import { type ChronicleEntry } from '../match/chronicle/chronicle-entry'
import { type BroadcastEvent } from '../turns/events'

/**
 * Wire-shaped tile-Action payload routed via `{ type: 'actionRequest' }`.
 * Mirrors the engine-side `ActionIntent` but with {@link HexCoordinate}
 * instead of `BoardPosition`. The server codec translates to `ActionIntent`
 * before `dispatch`.
 */
export type WireActionIntent =
	| { kind: 'build'; at: HexCoordinate }
	| { kind: 'capture'; at: HexCoordinate }
	| { kind: 'collect'; at: HexCoordinate }
	| { kind: 'explore'; at: HexCoordinate }
	| { kind: 'heal'; at: HexCoordinate }
	| { kind: 'recover'; at: HexCoordinate }
	| { kind: 'retire'; at: HexCoordinate }
	| { kind: 'upgrade-to-large'; at: HexCoordinate }
	| { kind: 'train'; at: HexCoordinate; unit: UnitType }
	| { kind: 'research'; at: HexCoordinate; tech: Tech }
	| { kind: 'selectPerk'; at: HexCoordinate; perk: VillagePerk }

export type { BroadcastEvent } from '../turns/events'

export type { FilteredGameState } from '../fog-of-war/schema'

// --- Lobby types ---

export const mapSizes = ['small', 'medium', 'large'] as const
export type MapSize = (typeof mapSizes)[number]

export type LobbyConfig = {
	mapSize: MapSize
	maxPlayers: number
	turnTimerSeconds: number | null // null = unlimited
}

export type LobbySlot = {
	playerId: string
	username: string
	tribe: Tribe | null
	isBot: boolean
	botDifficulty: Difficulty
	isReady: boolean
	isHost: boolean
}

export type LobbyState = {
	lobbyId: string
	inviteCode: string
	kind: 'private' | 'publicQueue'
	config: LobbyConfig
	slots: LobbySlot[]
	phase: 'waiting' | 'starting'
}

// --- Match types ---

export type MatchConfig = {
	mapSize: MapSize
	turnTimerSeconds: number | null
	players: MatchPlayer[]
	kind?: 'private' | 'publicQueue'
	/**
	 * Optional explicit board seed. The Daily Challenge sets this so every
	 * caller on the same UTC day plays the same map. Online matchmaker leaves
	 * it `undefined` and falls back to the engine's default (`Date.now()`).
	 */
	seed?: number
}

export type MatchPlayer = {
	playerId: string
	username: string
	tribe: Tribe
	isBot: boolean
	botDifficulty: Difficulty
}

export type MatchResult = {
	matchId: MatchId
	winner: Tribe | null
	players: {
		playerId: PlayerId
		username: Username
		tribe: Tribe
		isBot: boolean
	}[]
	duration: number // seconds
	turnCount: number
	mapSize: string
	completedAt: string // ISO timestamp
}

// --- WebSocket message types ---

export type ClientMessage =
	| { type: 'action'; action: GameAction }
	| { type: 'actionRequest'; action: WireActionIntent }
	| { type: 'endTurn' }
	| { type: 'setTribe'; tribe: Tribe }
	| { type: 'setReady'; ready: boolean }
	| { type: 'startGame' }
	| { type: 'configureLobby'; config: Partial<LobbyConfig> }
	| {
			type: 'setSlotBot'
			slotIndex: number
			isBot: boolean
			difficulty?: Difficulty
	  }

export type ServerMessage =
	| { type: 'lobbyUpdate'; lobby: LobbyState }
	| { type: 'gameStart'; matchId: string }
	| {
			type: 'gameState'
			state: FilteredGameState
			currentTurn: Tribe
			turnEndsAt: number | null
			viewer: Tribe
	  }
	| { type: 'actionResult'; success: boolean; message: string }
	| { type: 'playerForfeited'; tribe: Tribe; username: string }
	| { type: 'gameEnd'; result: MatchResult }
	| { type: 'error'; message: string }
	| { type: 'turnTimerUpdate'; turnEndsAt: number }
	| { type: 'turnEvents'; events: readonly BroadcastEvent[] }
	| { type: 'chronicleEntries'; entries: readonly ChronicleEntry[] }
	| {
			type: 'achievementsUnlocked'
			tribe: Tribe
			achievementIds: readonly AchievementId[]
	  }

export type ServerWireFrame = {
	protocolVersion: number
	sequence: number | null
	messageId: string | null
	message: ServerMessage
}
