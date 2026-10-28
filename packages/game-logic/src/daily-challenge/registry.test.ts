import {
	type ChronicleEntry,
	type ChronicleVillageCaptured
} from '../match/chronicle/chronicle-entry'
import { type Tribe } from '../domains/tribe'
import {
	DAILY_CHALLENGE_LIST,
	DAILY_CHALLENGE_REGISTRY,
	dailyChallengeIds,
	isDailyChallengeId
} from './registry'

const PLAYER: Tribe = 'barbarians'
const ENEMY: Tribe = 'orcs'

function captureEntry(
	actor: Tribe,
	turn: number,
	q = 0,
	r = 0
): ChronicleVillageCaptured {
	return {
		kind: 'villageCaptured',
		actorTribe: actor,
		targetTribe: null,
		position: { q_idx: q, r_idx: r },
		turn
	}
}

describe('isDailyChallengeId', () => {
	it('accepts registered IDs', () => {
		expect(isDailyChallengeId('capture-five-villages')).toBe(true)
	})

	it('rejects unknown values', () => {
		expect(isDailyChallengeId('capture-six-villages')).toBe(false)
		expect(isDailyChallengeId(0)).toBe(false)
		expect(isDailyChallengeId(null)).toBe(false)
	})
})

describe('DAILY_CHALLENGE_LIST', () => {
	it('preserves declaration order', () => {
		const ids = DAILY_CHALLENGE_LIST.map((d) => d.id)
		expect(ids).toEqual([...dailyChallengeIds])
	})
})

describe('capture-five-villages evaluator', () => {
	const challenge = DAILY_CHALLENGE_REGISTRY['capture-five-villages']

	it('reports zero progress on an empty chronicle', () => {
		const result = challenge.evaluate([], PLAYER)
		expect(result).toEqual({
			progress: 0,
			target: 5,
			completed: false,
			completedAtTurn: null
		})
	})

	it('counts the player tribe captures up to four without completing', () => {
		const entries: ChronicleEntry[] = [
			captureEntry(PLAYER, 2),
			captureEntry(PLAYER, 3),
			captureEntry(PLAYER, 5),
			captureEntry(PLAYER, 7)
		]
		const result = challenge.evaluate(entries, PLAYER)
		expect(result).toEqual({
			progress: 4,
			target: 5,
			completed: false,
			completedAtTurn: null
		})
	})

	it('completes on the fifth capture and records that turn', () => {
		const entries: ChronicleEntry[] = [
			captureEntry(PLAYER, 2),
			captureEntry(PLAYER, 3),
			captureEntry(PLAYER, 5),
			captureEntry(PLAYER, 7),
			captureEntry(PLAYER, 8)
		]
		const result = challenge.evaluate(entries, PLAYER)
		expect(result).toEqual({
			progress: 5,
			target: 5,
			completed: true,
			completedAtTurn: 8
		})
	})

	it('locks completedAtTurn to the fifth capture, not the latest', () => {
		const entries: ChronicleEntry[] = [
			captureEntry(PLAYER, 2),
			captureEntry(PLAYER, 3),
			captureEntry(PLAYER, 5),
			captureEntry(PLAYER, 7),
			captureEntry(PLAYER, 8),
			captureEntry(PLAYER, 12),
			captureEntry(PLAYER, 14)
		]
		const result = challenge.evaluate(entries, PLAYER)
		expect(result.completedAtTurn).toBe(8)
		expect(result.progress).toBe(5)
		expect(result.completed).toBe(true)
	})

	it('ignores captures performed by other tribes', () => {
		const entries: ChronicleEntry[] = [
			captureEntry(ENEMY, 2),
			captureEntry(ENEMY, 3),
			captureEntry(ENEMY, 4),
			captureEntry(ENEMY, 5),
			captureEntry(ENEMY, 6)
		]
		const result = challenge.evaluate(entries, PLAYER)
		expect(result).toEqual({
			progress: 0,
			target: 5,
			completed: false,
			completedAtTurn: null
		})
	})

	it('ignores non-capture chronicle entries', () => {
		const entries: ChronicleEntry[] = [
			{ kind: 'turnAdvanced', actorTribe: PLAYER, turn: 1 },
			{
				kind: 'researchCompleted',
				actorTribe: PLAYER,
				tech: 'climbing',
				turn: 2
			},
			captureEntry(PLAYER, 3),
			{
				kind: 'unitDefeated',
				actorTribe: PLAYER,
				targetTribe: ENEMY,
				position: { q_idx: 0, r_idx: 0 },
				turn: 4
			},
			captureEntry(PLAYER, 5)
		]
		const result = challenge.evaluate(entries, PLAYER)
		expect(result.progress).toBe(2)
		expect(result.completed).toBe(false)
	})
})
