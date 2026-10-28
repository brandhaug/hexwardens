import { vi } from 'vite-plus/test'
import { AudioManager } from './audio-manager'
import { playGameAudioEvent } from './audio-service'

function dummyAudioElement() {
	const el = {
		src: '',
		loop: false,
		preload: '',
		crossOrigin: null,
		paused: true,
		play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
		pause: vi.fn<() => void>()
	}
	return el
}

function buildManagerWithSpies() {
	const playSfx = vi.fn<() => void>()
	const playStinger = vi.fn<() => void>()
	const mgr = new AudioManager({
		contextFactory: () => {
			throw new Error('Web Audio not available')
		},
		audioElementFactory: () => dummyAudioElement()
	})
	mgr.playSfx = playSfx
	mgr.playStinger = playStinger
	return { mgr, playSfx, playStinger }
}

describe('playGameAudioEvent — event routing through AudioManager', () => {
	test('an unitDamage event with local-player involvement triggers playSfx', () => {
		const { mgr, playSfx } = buildManagerWithSpies()
		const out = playGameAudioEvent(
			{ kind: 'unitDamage', localPlayerInvolved: true },
			mgr
		)
		expect(out).toEqual({ bus: 'fx', sfx: 'unitDamage' })
		expect(playSfx).toHaveBeenCalledWith('unitDamage')
	})

	test('a silent event (no local-player involvement) calls neither method', () => {
		const { mgr, playSfx, playStinger } = buildManagerWithSpies()
		const out = playGameAudioEvent(
			{ kind: 'unitDamage', localPlayerInvolved: false },
			mgr
		)
		expect(out).toBeNull()
		expect(playSfx).not.toHaveBeenCalled()
		expect(playStinger).not.toHaveBeenCalled()
	})

	test('a capitalCaptured event routes through playStinger, not playSfx', () => {
		const { mgr, playSfx, playStinger } = buildManagerWithSpies()
		playGameAudioEvent(
			{ kind: 'capitalCaptured', capturedByLocalPlayer: true },
			mgr
		)
		expect(playStinger).toHaveBeenCalledWith('capitalCaptured')
		expect(playSfx).not.toHaveBeenCalled()
	})

	test('a level-up event maps to the levelUp SFX on the fx bus', () => {
		const { mgr, playSfx } = buildManagerWithSpies()
		playGameAudioEvent({ kind: 'levelUp', tribe: 'barbarians' }, mgr)
		expect(playSfx).toHaveBeenCalledWith('levelUp')
	})

	test('victory and defeat each fire their own one-shot', () => {
		const { mgr, playSfx } = buildManagerWithSpies()
		playGameAudioEvent({ kind: 'victory' }, mgr)
		playGameAudioEvent({ kind: 'defeat' }, mgr)
		expect(playSfx).toHaveBeenNthCalledWith(1, 'victory')
		expect(playSfx).toHaveBeenNthCalledWith(2, 'defeat')
	})
})
