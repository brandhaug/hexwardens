import { vi, type Mock } from 'vite-plus/test'
import { AudioManager } from './audio-manager'

/**
 * Minimal Web Audio mock. Each node tracks its `connect`/`disconnect`
 * topology so the smoke test for "stinger nodes wire without throwing"
 * has something observable; gain values are a public surface and exposed
 * directly. The mock is intentionally small — the contract under test is
 * the manager's public methods, not the underlying node graph.
 */
type FakeNode = {
	connect: Mock<() => void>
	disconnect: Mock<() => void>
}

interface FakeGainNode extends FakeNode {
	gain: {
		value: number
		setValueAtTime: Mock<() => void>
		linearRampToValueAtTime: Mock<() => void>
		exponentialRampToValueAtTime: Mock<() => void>
	}
}

interface FakeOscillatorNode extends FakeNode {
	type: OscillatorType
	frequency: {
		value: number
		setValueAtTime: Mock<() => void>
		exponentialRampToValueAtTime: Mock<() => void>
	}
	start: Mock<() => void>
	stop: Mock<() => void>
}

interface FakeBiquadFilterNode extends FakeNode {
	type: BiquadFilterType
	frequency: { value: number }
	Q: { value: number }
	gain: { value: number }
}

interface FakeContext {
	state: AudioContextState
	currentTime: number
	sampleRate: number
	destination: FakeNode
	createGain: () => FakeGainNode
	createOscillator: () => FakeOscillatorNode
	createBiquadFilter: () => FakeBiquadFilterNode
	createDelay: (max: number) => FakeNode & { delayTime: { value: number } }
	createDynamicsCompressor: () => FakeNode & {
		threshold: { value: number }
		knee: { value: number }
		ratio: { value: number }
		attack: { value: number }
		release: { value: number }
	}
	createBuffer: (
		channels: number,
		length: number,
		sampleRate: number
	) => { getChannelData: () => Float32Array<ArrayBuffer> }
	createBufferSource: () => FakeNode & {
		buffer: {
			getChannelData(channel: number): Float32Array<ArrayBuffer>
		} | null
		start: Mock<() => void>
		stop: Mock<() => void>
	}
	createMediaElementSource: () => FakeNode
	resume: Mock<() => Promise<void>>
	close: Mock<() => Promise<void>>
}

const makeGain = (): FakeGainNode => ({
	gain: {
		value: 1,
		setValueAtTime: vi.fn<() => void>(),
		linearRampToValueAtTime: vi.fn<() => void>(),
		exponentialRampToValueAtTime: vi.fn<() => void>()
	},
	connect: vi.fn<() => void>(),
	disconnect: vi.fn<() => void>()
})

function createFakeContext(): FakeContext {
	return {
		state: 'running',
		currentTime: 0,
		sampleRate: 44_100,
		destination: {
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		},
		createGain: makeGain,
		createOscillator: () => ({
			type: 'sine',
			frequency: {
				value: 440,
				setValueAtTime: vi.fn<() => void>(),
				exponentialRampToValueAtTime: vi.fn<() => void>()
			},
			start: vi.fn<() => void>(),
			stop: vi.fn<() => void>(),
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		}),
		createBiquadFilter: () => ({
			type: 'lowpass',
			frequency: { value: 800 },
			Q: { value: 1 },
			gain: { value: 0 },
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		}),
		createDelay: () => ({
			delayTime: { value: 0 },
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		}),
		createDynamicsCompressor: () => ({
			threshold: { value: -24 },
			knee: { value: 30 },
			ratio: { value: 12 },
			attack: { value: 0.003 },
			release: { value: 0.25 },
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		}),
		createBuffer: (_c, length) => ({
			getChannelData: () => new Float32Array(length)
		}),
		createBufferSource: () => ({
			buffer: null,
			start: vi.fn<() => void>(),
			stop: vi.fn<() => void>(),
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		}),
		createMediaElementSource: () => ({
			connect: vi.fn<() => void>(),
			disconnect: vi.fn<() => void>()
		}),
		resume: vi.fn<() => Promise<void>>(() => Promise.resolve()),
		close: vi.fn<() => Promise<void>>(() => Promise.resolve())
	}
}

interface FakeAudioElement {
	src: string
	loop: boolean
	preload: string
	crossOrigin: string | null
	paused: boolean
	play: Mock<() => Promise<void>>
	pause: Mock<() => void>
}

function createFakeAudioElement(src: string): FakeAudioElement {
	const el: FakeAudioElement = {
		src,
		loop: false,
		preload: '',
		crossOrigin: null,
		paused: true,
		play: vi.fn<() => Promise<void>>(() => {
			el.paused = false
			return Promise.resolve()
		}),
		pause: vi.fn<() => void>(() => {
			el.paused = true
		})
	}
	return el
}

function buildManager(opts?: { now?: () => number }) {
	const fakeCtx = createFakeContext()
	const elements: FakeAudioElement[] = []
	const audioElementFactory = (src: string) => {
		const el = createFakeAudioElement(src)
		elements.push(el)
		return el
	}
	const manager = new AudioManager({
		contextFactory: () => fakeCtx,
		audioElementFactory,
		now: opts?.now,
		initialVolumes: { master: 0.7, music: 0.5, fx: 0.8, muted: false }
	})
	return { manager, fakeCtx, elements }
}

describe('AudioManager — public-method side effects', () => {
	test('prepare builds the bus graph exactly once on repeated calls', () => {
		const { manager, fakeCtx } = buildManager()
		const spy = vi.spyOn(fakeCtx, 'createGain')
		manager.prepare()
		const firstCount = spy.mock.calls.length
		expect(firstCount).toBeGreaterThan(0)
		manager.prepare()
		expect(spy.mock.calls).toHaveLength(firstCount)
	})

	test('prepare resumes a suspended context instead of building a new one', () => {
		const { manager, fakeCtx } = buildManager()
		manager.prepare()
		fakeCtx.state = 'suspended'
		manager.prepare()
		expect(fakeCtx.resume).toHaveBeenCalled()
	})

	test('playSfx is a no-op while muted', () => {
		const { manager, fakeCtx } = buildManager()
		manager.setMuted(true)
		const oscSpy = vi.spyOn(fakeCtx, 'createOscillator')
		manager.playSfx('select')
		expect(oscSpy).not.toHaveBeenCalled()
	})

	test('playSfx schedules at least one node for an unmuted, never-fired sound', () => {
		const { manager, fakeCtx } = buildManager()
		const oscSpy = vi.spyOn(fakeCtx, 'createOscillator')
		manager.playSfx('select')
		expect(oscSpy).toHaveBeenCalled()
	})

	test('playSfx respects the per-event re-trigger cooldown', () => {
		let t = 0
		const { manager, fakeCtx } = buildManager({ now: () => t })
		const oscSpy = vi.spyOn(fakeCtx, 'createOscillator')
		manager.playSfx('victory')
		const initial = oscSpy.mock.calls.length
		t = 100 // well within the 5s cooldown
		manager.playSfx('victory')
		expect(oscSpy.mock.calls).toHaveLength(initial)
		t = 6000
		manager.playSfx('victory')
		expect(oscSpy.mock.calls.length).toBeGreaterThan(initial)
	})

	test('playStinger wires the announcer chain without throwing', () => {
		const { manager } = buildManager()
		expect(() => manager.playStinger('capitalCaptured')).not.toThrow()
	})

	test('startMusic creates a single audio element on repeated calls to the same track', () => {
		const { manager, elements } = buildManager()
		manager.startMusic('match')
		manager.startMusic('match')
		expect(elements).toHaveLength(1)
		expect(elements[0]?.src).toContain('match')
	})

	test('startMusic switches tracks by tearing down the previous element', () => {
		const { manager, elements } = buildManager()
		manager.startMusic('lobby')
		manager.startMusic('match')
		expect(elements).toHaveLength(2)
		expect(elements[0]?.src).toBe('')
		expect(elements[1]?.paused).toBe(false)
	})

	test('stopMusic pauses and clears the element', () => {
		const { manager, elements } = buildManager()
		manager.startMusic('lobby')
		manager.stopMusic()
		expect(elements[0]?.pause).toHaveBeenCalled()
		expect(manager.getCurrentMusicTrack()).toBeNull()
	})

	test('setMuted=true zeros the master gain; setMuted=false restores it', () => {
		const { manager } = buildManager()
		manager.prepare()
		manager.setMuted(true)
		expect(manager.getBusGainForTesting('master')?.gain.value).toBe(0)
		manager.setMuted(false)
		expect(manager.getBusGainForTesting('master')?.gain.value).toBe(0.7)
	})

	test('setVolumes propagates per-bus volumes to gain nodes', () => {
		const { manager } = buildManager()
		manager.prepare()
		manager.setVolumes({ master: 0.5, music: 0.2, fx: 0.4, muted: false })
		expect(manager.getBusGainForTesting('master')?.gain.value).toBe(0.5)
		expect(manager.getBusGainForTesting('music')?.gain.value).toBe(0.2)
		expect(manager.getBusGainForTesting('fx')?.gain.value).toBe(0.4)
	})

	test('dispose tears down the context and silences subsequent calls', () => {
		const { manager, fakeCtx } = buildManager()
		manager.prepare()
		manager.dispose()
		expect(fakeCtx.close).toHaveBeenCalled()
		const oscSpy = vi.spyOn(fakeCtx, 'createOscillator')
		manager.playSfx('select')
		manager.playStinger('capitalCaptured')
		expect(oscSpy).not.toHaveBeenCalled()
	})

	test('gracefully no-ops when the context factory throws (Web Audio unavailable)', () => {
		const manager = new AudioManager({
			contextFactory: () => {
				throw new Error('Web Audio not available')
			},
			audioElementFactory: () => createFakeAudioElement('')
		})
		expect(() => manager.prepare()).not.toThrow()
		expect(() => manager.playSfx('select')).not.toThrow()
		expect(() => manager.playStinger('capitalCaptured')).not.toThrow()
		expect(manager.isPrepared()).toBe(false)
	})
})
