import { type BotActionPlan } from './bot-types'
import { type ScoringFixture } from './scoring-fixture'

export type ScorerKind =
	| 'attack'
	| 'capture'
	| 'train'
	| 'explore'
	| 'collect'
	| 'build'
	| 'heal'
	| 'research'
	| 'perk'
	| 'move'

export interface ScoredAction {
	kind: ScorerKind
	score: number
	execute: () => BotActionPlan
}

export type Scorer = (fixture: ScoringFixture) => ScoredAction[]
