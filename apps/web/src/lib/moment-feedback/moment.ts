import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { assertNever } from '@hexwardens/game-logic/type-utils'

/**
 * A "moment" is a presentation-only event derived from a transition between
 * two `GameState` snapshots. Moments drive tile-anchored callouts (damage
 * numbers, gold gain, unit defeat, capture, level-up). They never feed back
 * into authoritative state — the game state remains the source of truth.
 *
 * Each moment carries its own `id` so the overlay can mount/unmount it
 * idempotently, and the originating tile coordinate so the renderer knows
 * where to anchor the callout.
 */
export type Moment =
	| DamageMoment
	| HealMoment
	| UnitDefeatedMoment
	| GoldGainMoment
	| VillageCapturedMoment
	| VillageLevelUpMoment
	| ResearchCompletedMoment

export interface DamageMoment {
	readonly kind: 'damage'
	readonly id: string
	readonly at: BoardPosition
	readonly amount: number
	readonly tribe: Tribe
}

export interface HealMoment {
	readonly kind: 'heal'
	readonly id: string
	readonly at: BoardPosition
	readonly amount: number
	readonly tribe: Tribe
}

export interface UnitDefeatedMoment {
	readonly kind: 'unit-defeated'
	readonly id: string
	readonly at: BoardPosition
	readonly tribe: Tribe
}

export interface GoldGainMoment {
	readonly kind: 'gold-gain'
	readonly id: string
	readonly at: BoardPosition
	readonly amount: number
	readonly tribe: Tribe
}

export interface VillageCapturedMoment {
	readonly kind: 'village-captured'
	readonly id: string
	readonly at: BoardPosition
	readonly tribe: Tribe
}

export interface VillageLevelUpMoment {
	readonly kind: 'village-level-up'
	readonly id: string
	readonly at: BoardPosition
	readonly tribe: Tribe
	readonly level: number
}

export interface ResearchCompletedMoment {
	readonly kind: 'research-completed'
	readonly id: string
	readonly tribe: Tribe
	readonly tech: string
}

export function isTileAnchoredMoment(
	moment: Moment
): moment is Exclude<Moment, ResearchCompletedMoment> {
	return moment.kind !== 'research-completed'
}

/**
 * Visual treatment for a tile-anchored callout. `tone` picks the colour
 * family (ember for harm, moss for recovery, gold for riches and renown);
 * `emphasis` picks the shape — `number` renders as a bare floating numeral,
 * `plaque` as a small carved label chip for the wordier moments.
 */
export interface TileAnchoredCallout {
	readonly label: string
	readonly tone: 'damage' | 'heal' | 'gold' | 'renown'
	readonly emphasis: 'number' | 'plaque'
}

export function tileAnchoredMomentCallout(
	moment: Exclude<Moment, ResearchCompletedMoment>
): TileAnchoredCallout {
	switch (moment.kind) {
		case 'damage': {
			return { label: `-${moment.amount}`, tone: 'damage', emphasis: 'number' }
		}
		case 'heal': {
			return { label: `+${moment.amount}`, tone: 'heal', emphasis: 'number' }
		}
		case 'unit-defeated': {
			return { label: 'Defeated', tone: 'damage', emphasis: 'plaque' }
		}
		case 'gold-gain': {
			return { label: `+${moment.amount}g`, tone: 'gold', emphasis: 'number' }
		}
		case 'village-captured': {
			return { label: 'Captured', tone: 'renown', emphasis: 'plaque' }
		}
		case 'village-level-up': {
			return { label: `Lv ${moment.level}`, tone: 'renown', emphasis: 'plaque' }
		}
		default: {
			return assertNever(moment)
		}
	}
}
