import {
	broadcastEventToGameAudio,
	mapGameAudioEvent,
	type GameAudioEvent
} from './audio-events'

// Real tribe slugs from `@hexwardens/game-logic/domains/tribe` so the test
// keeps the same compile-checked discriminant the runtime sees.
const A = 'barbarians'
const B = 'rogues'
const C = 'druids'

describe('mapGameAudioEvent — event → (bus, sound) contract', () => {
	test('unitDamage involving the local player routes to fx bus', () => {
		expect(
			mapGameAudioEvent({ kind: 'unitDamage', localPlayerInvolved: true })
		).toEqual({ bus: 'fx', sfx: 'unitDamage' })
	})

	test('unitDamage with no local-player involvement is silent', () => {
		expect(
			mapGameAudioEvent({ kind: 'unitDamage', localPlayerInvolved: false })
		).toBeNull()
	})

	test('unitDeath involving the local player routes to fx bus', () => {
		expect(
			mapGameAudioEvent({ kind: 'unitDeath', localPlayerInvolved: true })
		).toEqual({ bus: 'fx', sfx: 'unitDeath' })
	})

	test('villageCaptured always routes to fx bus', () => {
		expect(
			mapGameAudioEvent({
				kind: 'villageCaptured',
				capturedByLocalPlayer: true
			})
		).toEqual({ bus: 'fx', sfx: 'villageCaptured' })
		expect(
			mapGameAudioEvent({
				kind: 'villageCaptured',
				capturedByLocalPlayer: false
			})
		).toEqual({ bus: 'fx', sfx: 'villageCaptured' })
	})

	test('capitalCaptured always routes through the announcer bus as a stinger', () => {
		expect(
			mapGameAudioEvent({
				kind: 'capitalCaptured',
				capturedByLocalPlayer: true
			})
		).toEqual({ bus: 'announcer', stinger: 'capitalCaptured' })
	})

	test('research / build / level / enemy-turn / victory / defeat fan out to fx bus', () => {
		const cases: { event: GameAudioEvent; sfx: string }[] = [
			{ event: { kind: 'techComplete', tribe: A }, sfx: 'techComplete' },
			{ event: { kind: 'buildComplete', tribe: A }, sfx: 'buildComplete' },
			{ event: { kind: 'levelUp', tribe: A }, sfx: 'levelUp' },
			{ event: { kind: 'enemyTurnStart' }, sfx: 'enemyTurnStart' },
			{ event: { kind: 'yourTurnStart' }, sfx: 'yourTurnStart' },
			{ event: { kind: 'victory' }, sfx: 'victory' },
			{ event: { kind: 'defeat' }, sfx: 'defeat' }
		]
		for (const { event, sfx } of cases) {
			expect(mapGameAudioEvent(event)).toEqual({ bus: 'fx', sfx })
		}
	})
})

describe('broadcastEventToGameAudio — turnEvents stream lowering', () => {
	test('research completion for the local tribe lowers to techComplete', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'research', tribe: A, tech: 'climbing', completed: true },
			A
		)
		expect(out).toEqual([{ kind: 'techComplete', tribe: A }])
	})

	test('research progress (not completed) is silent', () => {
		const out = broadcastEventToGameAudio(
			{
				type: 'research',
				tribe: A,
				tech: 'climbing',
				completed: false,
				turnsRemaining: 2
			},
			A
		)
		expect(out).toEqual([])
	})

	test('research for another tribe is silent in the local-player view', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'research', tribe: B, tech: 'climbing', completed: true },
			A
		)
		expect(out).toEqual([])
	})

	test('villageLevel emits one level-up cue per local-tribe level batch', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'villageLevel', tribe: A, levelUps: 2 },
			A
		)
		expect(out).toEqual([{ kind: 'levelUp', tribe: A }])
	})

	test('turnRotated from the local tribe to someone else queues enemyTurnStart', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'turnRotated', from: A, to: B, turn: 5 },
			A
		)
		expect(out).toEqual([{ kind: 'enemyTurnStart' }])
	})

	test('turnRotated between two opponents is silent for the local player', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'turnRotated', from: B, to: C, turn: 5 },
			A
		)
		expect(out).toEqual([])
	})

	test('turnRotated back to the local tribe queues yourTurnStart', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'turnRotated', from: C, to: A, turn: 6 },
			A
		)
		expect(out).toEqual([{ kind: 'yourTurnStart' }])
	})

	test('gameOver maps to victory or defeat keyed on local tribe', () => {
		expect(
			broadcastEventToGameAudio({ type: 'gameOver', winner: A }, A)
		).toEqual([{ kind: 'victory' }])
		expect(
			broadcastEventToGameAudio({ type: 'gameOver', winner: B }, A)
		).toEqual([{ kind: 'defeat' }])
	})

	test('salary events are intentionally silent', () => {
		const out = broadcastEventToGameAudio(
			{ type: 'salary', tribe: A, amount: 4 },
			A
		)
		expect(out).toEqual([])
	})

	test('villageCaptured events defer to state-diff lowering and are silent here', () => {
		const out = broadcastEventToGameAudio(
			{
				type: 'villageCaptured',
				byTribe: A,
				fromTribe: B,
				at: { q_idx: 0, r_idx: 0 }
			},
			A
		)
		expect(out).toEqual([])
	})

	test('spectator (localTribe = null) still hears victory but not enemy-turn pings', () => {
		expect(
			broadcastEventToGameAudio({ type: 'gameOver', winner: A }, null)
		).toEqual([{ kind: 'victory' }])
		expect(
			broadcastEventToGameAudio(
				{ type: 'turnRotated', from: A, to: B, turn: 4 },
				null
			)
		).toEqual([])
	})
})
