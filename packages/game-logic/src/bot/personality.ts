import { type Difficulty } from '../difficulty'
import { type ScorerKind } from './score-context'

/**
 * Per-scorer weight overrides. A weight of `1` (or absent key) is the
 * neutral identity. Lower values dampen a scorer's influence; higher values
 * amplify it. Disabling a scorer entirely is done via `enabledScorers`, not
 * a zero weight, so we can short-circuit before paying scorer cost.
 */
export type ScorerWeights = Partial<Record<ScorerKind, number>>

/**
 * Identity for a personality slot. Today this aliases the `Difficulty`
 * enum (Beginner / Intermediate / Advanced / Expert / Legend). New
 * personalities just add an entry to {@link personalities}.
 */
export type DifficultyId = Difficulty

/**
 * The complete description of a bot's behavior. Difficulty modulation that
 * was previously scattered across `scorer-registry`, `difficulty-config`,
 * and `scoring-fixture` lives here as one record per personality.
 */
export interface BotPersonality {
	readonly id: DifficultyId
	/** Per-scorer score multipliers. Missing keys default to `1`. */
	readonly weights: ScorerWeights
	/** Scorers that contribute candidates. Excluded scorers run zero work. */
	readonly enabledScorers: ReadonlySet<ScorerKind>
	/** Movement scorer uses the O(moves²) lookahead variant when true. */
	readonly lookahead: boolean
	/** Width of post-modifier random jitter. Larger = noisier picks. */
	readonly noiseRange: number
	/** Movement scorer factors in defender / village proximity heuristics. */
	readonly positionalAwareness: boolean
}

const ALL_SCORERS: readonly ScorerKind[] = [
	'attack',
	'capture',
	'train',
	'explore',
	'collect',
	'build',
	'heal',
	'research',
	'perk',
	'move'
]

const allScorers: ReadonlySet<ScorerKind> = new Set(ALL_SCORERS)

/**
 * Pre-baked personality table keyed by {@link DifficultyId}. Adding a new
 * personality is a single record entry — no scorer edits required.
 *
 * The `Beginner`–`Legend` entries mirror the legacy
 * `difficulty-config::difficultyToTuning` so that, given an identical seeded
 * state and rng, the picked action matches the pre-refactor bot exactly.
 */
export const personalities: Record<DifficultyId, BotPersonality> = {
	Beginner: {
		id: 'Beginner',
		weights: {},
		enabledScorers: allScorers,
		lookahead: false,
		noiseRange: 50,
		positionalAwareness: false
	},
	Intermediate: {
		id: 'Intermediate',
		weights: {},
		enabledScorers: allScorers,
		lookahead: false,
		noiseRange: 30,
		positionalAwareness: false
	},
	Advanced: {
		id: 'Advanced',
		weights: {},
		enabledScorers: allScorers,
		lookahead: false,
		noiseRange: 15,
		positionalAwareness: true
	},
	Expert: {
		id: 'Expert',
		weights: {},
		enabledScorers: allScorers,
		lookahead: true,
		noiseRange: 5,
		positionalAwareness: true
	},
	Legend: {
		id: 'Legend',
		weights: {},
		enabledScorers: allScorers,
		lookahead: true,
		noiseRange: 0,
		positionalAwareness: true
	}
}

/**
 * Apply a personality's weight to a raw scorer score. Missing weights use
 * `1` (identity), so a personality with `{}` leaves scores untouched.
 *
 * Callers may layer per-call overrides on top of personality weights;
 * overrides take precedence (used by `bot-action.test.ts` to flip
 * capture→attack via `scorerWeights: { attack: 10 }`).
 */
export function applyPersonalityWeight(
	personality: BotPersonality,
	scorerKind: ScorerKind,
	rawScore: number,
	overrides: ScorerWeights = {}
): number {
	const weight = overrides[scorerKind] ?? personality.weights[scorerKind] ?? 1
	return rawScore * weight
}
