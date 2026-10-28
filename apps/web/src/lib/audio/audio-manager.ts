import { Effect } from 'effect'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { type SfxName, type StingerName } from './audio-events'
import { type AudioBus } from './buses'
import { getSfxRecipe, getStingerRecipe, type SfxStep } from './sfx-definitions'

/** The Web Audio surface used by this manager and its in-memory test implementation. */
interface AudioConnection {
	connect(destination: AudioConnection): void
	disconnect(): void
}
interface AudioLevel {
	value: number
	setValueAtTime(value: number, time: number): void
	linearRampToValueAtTime(value: number, time: number): void
	exponentialRampToValueAtTime(value: number, time: number): void
}
interface AudioGain extends AudioConnection {
	gain: AudioLevel
}
interface AudioFilter extends AudioConnection {
	type: BiquadFilterType
	frequency: { value: number }
	Q: { value: number }
	gain: { value: number }
}
interface AudioOscillator extends AudioConnection {
	type: OscillatorType
	frequency: Pick<
		AudioLevel,
		'value' | 'setValueAtTime' | 'exponentialRampToValueAtTime'
	>
	start(time: number): void
	stop(time: number): void
}
interface AudioSamples {
	getChannelData(channel: number): Float32Array<ArrayBuffer>
}
interface AudioSource extends AudioConnection {
	buffer: AudioSamples | null
	start(time: number): void
	stop(time: number): void
}
interface MusicElement {
	src: string
	loop: boolean
	paused: boolean
	play(): Promise<void>
	pause(): void
}
interface AudioEngine {
	state: AudioContextState
	currentTime: number
	sampleRate: number
	destination: AudioConnection
	createGain(): AudioGain
	createOscillator(): AudioOscillator
	createBiquadFilter(): AudioFilter
	createDelay(max: number): AudioConnection & { delayTime: { value: number } }
	createDynamicsCompressor(): AudioConnection & {
		threshold: { value: number }
		knee: { value: number }
		ratio: { value: number }
		attack: { value: number }
		release: { value: number }
	}
	createBuffer(
		channels: number,
		length: number,
		sampleRate: number
	): AudioSamples
	createBufferSource(): AudioSource
	createMediaElementSource(element: MusicElement): AudioConnection
	resume(): Promise<void>
	close(): Promise<void>
}

/**
 * Tracks that the music bus knows how to stream. The pair maps to MP3 (or
 * OGG; the browser picks) files under `apps/web/public/audio/music`. Music
 * is loaded lazily on `startMusic` so the home page doesn't pay the asset
 * cost — see PRD user story #20.
 */
export type MusicTrack = 'lobby' | 'match'

const musicTrackToUrl: Record<MusicTrack, string> = {
	lobby: '/audio/music/lobby.mp3',
	match: '/audio/music/match.mp3'
}

/**
 * Volume-and-mute snapshot consumed by `AudioManager`. Mirrors
 * `AudioPreferences` minus the master / mute coupling, which the manager
 * applies to the master gain node directly.
 */
export interface AudioVolumes {
	master: number
	music: number
	fx: number
	muted: boolean
}

/**
 * Construction options. Tests pass a synthetic `AudioContext` and audio
 * element factory; production lets the manager build its own. We keep the
 * surface small — the manager is the one place the rest of the app
 * touches Web Audio.
 */
export interface AudioManagerOptions {
	contextFactory?: () => AudioEngine
	audioElementFactory?: (src: string) => MusicElement
	now?: (() => number) | undefined
	initialVolumes?: AudioVolumes
}

/**
 * Re-trigger guard. The same gameplay event can fan out from both the
 * server broadcast and a state-diff hook in rapid succession — the
 * cooldown stops a single event from doubling up. The window is short
 * enough that a player drumming a key won't notice the gate.
 */
const SFX_RETRIGGER_WINDOW_MS: Record<SfxName, number> = {
	select: 0,
	deselect: 0,
	move: 0,
	action: 0,
	turnEnd: 0,
	unitDamage: 60,
	unitDeath: 120,
	villageCaptured: 250,
	techComplete: 600,
	buildComplete: 250,
	levelUp: 400,
	achievement: 600,
	enemyTurnStart: 600,
	yourTurnStart: 600,
	victory: 5000,
	defeat: 5000
}
const STINGER_RETRIGGER_WINDOW_MS: Record<StingerName, number> = {
	capitalCaptured: 1500
}

const ANNOUNCER_TUNING = {
	highpassFreq: 120,
	presenceFreq: 2420,
	presenceGain: 2.8,
	delayTime: 0.092,
	feedback: 0.18,
	echoVolume: 0.77,
	compressorThreshold: -18,
	compressorRatio: 4
} as const

/**
 * The central audio service. Owns the buses, schedules SFX, manages the
 * looping music element, and exposes a small public surface that maps
 * 1:1 to the PRD's contract. Construction is cheap: the AudioContext is
 * not created until `prepare()` runs (typically on the first user
 * gesture), and music is not fetched until `startMusic()`.
 */
export class AudioManager {
	private readonly contextFactory: () => AudioEngine
	private readonly audioElementFactory: (src: string) => MusicElement
	private readonly now: () => number

	private context: AudioEngine | null = null
	private masterGain: AudioGain | null = null
	private musicGain: AudioGain | null = null
	private fxGain: AudioGain | null = null
	private announcerGain: AudioGain | null = null

	private musicElement: MusicElement | null = null
	private musicSource: AudioConnection | null = null
	private currentTrack: MusicTrack | null = null

	private volumes: AudioVolumes = {
		master: 0.7,
		music: 0.55,
		fx: 0.85,
		muted: false
	}
	private readonly lastSfxAt = new Map<SfxName, number>()
	private readonly lastStingerAt = new Map<StingerName, number>()
	private disposed = false

	constructor(options: AudioManagerOptions = {}) {
		this.contextFactory = options.contextFactory ?? (() => new AudioContext())
		this.audioElementFactory =
			options.audioElementFactory ??
			((src) => {
				const el = new Audio(src)
				el.loop = true
				el.preload = 'auto'
				el.crossOrigin = 'anonymous'
				return el
			})
		this.now = options.now ?? (() => Date.now())
		if (options.initialVolumes) {
			this.volumes = { ...options.initialVolumes }
		}
	}

	/**
	 * `true` once the manager has built the underlying AudioContext. The
	 * routes use this to gate deferred `startMusic` calls until the user
	 * has clicked once and unlocked autoplay.
	 */
	isPrepared(): boolean {
		return this.context !== null
	}

	/**
	 * Build (or resume) the AudioContext and the bus graph. Safe to call
	 * many times — repeated invocations resume a suspended context (the
	 * autoplay-policy unlock path) and otherwise no-op.
	 */
	prepare(): void {
		if (this.disposed) {
			return
		}
		if (this.context) {
			if (this.context.state === 'suspended') {
				void this.context.resume()
			}
			return
		}
		// Unsupported browsers leave audio disabled; a later gesture can retry.
		this.context = Effect.runSync(
			Effect.try(() => this.contextFactory()).pipe(
				Effect.orElseSucceed(() => null)
			)
		)
		if (this.context === null) {
			return
		}
		this.buildBuses()
	}

	private buildBuses(): void {
		const ctx = this.context
		if (!ctx) {
			return
		}
		this.masterGain = ctx.createGain()
		this.masterGain.gain.value = this.volumes.muted ? 0 : this.volumes.master
		this.masterGain.connect(ctx.destination)

		this.musicGain = ctx.createGain()
		this.musicGain.gain.value = this.volumes.music
		this.musicGain.connect(this.masterGain)

		this.fxGain = ctx.createGain()
		this.fxGain.gain.value = this.volumes.fx
		this.fxGain.connect(this.masterGain)

		this.announcerGain = this.buildAnnouncerChain(ctx, this.fxGain)
	}

	private buildAnnouncerChain(ctx: AudioEngine, target: AudioGain): AudioGain {
		const bus = ctx.createGain()
		bus.gain.value = 1
		const highpass = ctx.createBiquadFilter()
		highpass.type = 'highpass'
		highpass.frequency.value = ANNOUNCER_TUNING.highpassFreq
		const presence = ctx.createBiquadFilter()
		presence.type = 'peaking'
		presence.frequency.value = ANNOUNCER_TUNING.presenceFreq
		presence.Q.value = 1
		presence.gain.value = ANNOUNCER_TUNING.presenceGain
		const compressor = ctx.createDynamicsCompressor()
		compressor.threshold.value = ANNOUNCER_TUNING.compressorThreshold
		compressor.knee.value = 14
		compressor.ratio.value = ANNOUNCER_TUNING.compressorRatio
		compressor.attack.value = 0.004
		compressor.release.value = 0.18
		const delay = ctx.createDelay(0.5)
		delay.delayTime.value = ANNOUNCER_TUNING.delayTime
		const feedback = ctx.createGain()
		feedback.gain.value = ANNOUNCER_TUNING.feedback
		const echo = ctx.createGain()
		echo.gain.value = ANNOUNCER_TUNING.echoVolume

		bus.connect(highpass)
		highpass.connect(presence)
		presence.connect(compressor)
		compressor.connect(target)
		compressor.connect(delay)
		delay.connect(feedback)
		feedback.connect(delay)
		delay.connect(echo)
		echo.connect(target)

		return bus
	}

	setVolumes(volumes: AudioVolumes): void {
		this.volumes = { ...volumes }
		if (!this.context) {
			return
		}
		const masterTarget = this.volumes.muted ? 0 : this.volumes.master
		if (this.masterGain) {
			this.masterGain.gain.value = masterTarget
		}
		if (this.musicGain) {
			this.musicGain.gain.value = this.volumes.music
		}
		if (this.fxGain) {
			this.fxGain.gain.value = this.volumes.fx
		}
	}

	setMuted(muted: boolean): void {
		this.setVolumes({ ...this.volumes, muted })
	}

	playSfx(name: SfxName): void {
		if (this.disposed || this.volumes.muted) {
			return
		}
		this.prepare()
		const ctx = this.context
		const fxBus = this.fxGain
		if (!ctx || !fxBus) {
			return
		}
		if (
			this.isCoolingDown(this.lastSfxAt, name, SFX_RETRIGGER_WINDOW_MS[name])
		) {
			return
		}
		this.lastSfxAt.set(name, this.now())
		this.scheduleRecipe(getSfxRecipe(name), ctx, fxBus)
	}

	playStinger(name: StingerName): void {
		if (this.disposed || this.volumes.muted) {
			return
		}
		this.prepare()
		const ctx = this.context
		const announcer = this.announcerGain
		if (!ctx || !announcer) {
			return
		}
		if (
			this.isCoolingDown(
				this.lastStingerAt,
				name,
				STINGER_RETRIGGER_WINDOW_MS[name]
			)
		) {
			return
		}
		this.lastStingerAt.set(name, this.now())
		this.scheduleRecipe(getStingerRecipe(name), ctx, announcer)
	}

	private isCoolingDown<K>(
		map: Map<K, number>,
		key: K,
		windowMs: number
	): boolean {
		if (windowMs <= 0) {
			return false
		}
		const last = map.get(key)
		if (last === undefined) {
			return false
		}
		return this.now() - last < windowMs
	}

	startMusic(track: MusicTrack): void {
		if (this.disposed) {
			return
		}
		this.prepare()
		const ctx = this.context
		const musicBus = this.musicGain
		if (!ctx || !musicBus) {
			return
		}
		if (this.currentTrack === track && this.musicElement) {
			// Already playing this track — resume if paused, otherwise no-op.
			if (this.musicElement.paused) {
				void this.musicElement.play()
			}
			return
		}
		this.tearDownMusic()
		const url = musicTrackToUrl[track]
		const el = this.audioElementFactory(url)
		el.loop = true
		const source = ctx.createMediaElementSource(el)
		source.connect(musicBus)
		this.musicElement = el
		this.musicSource = source
		this.currentTrack = track
		// `play()` returns a rejected promise if autoplay is blocked. We
		// swallow it and rely on the next user gesture to retry — the UI
		// layer calls `prepare()` on click, then `startMusic` again.
		void el.play().catch(() => undefined)
	}

	stopMusic(): void {
		this.tearDownMusic()
	}

	pauseMusic(): void {
		if (!this.musicElement) {
			return
		}
		if (!this.musicElement.paused) {
			this.musicElement.pause()
		}
	}

	resumeMusic(): void {
		if (!this.musicElement || !this.currentTrack) {
			return
		}
		if (this.musicElement.paused) {
			void this.musicElement.play().catch(() => undefined)
		}
	}

	getCurrentMusicTrack(): MusicTrack | null {
		return this.currentTrack
	}

	private tearDownMusic(): void {
		if (this.musicElement) {
			this.musicElement.pause()
			this.musicElement.src = ''
		}
		if (this.musicSource) {
			const source = this.musicSource
			Effect.runSync(Effect.try(() => source.disconnect()).pipe(Effect.ignore))
		}
		this.musicElement = null
		this.musicSource = null
		this.currentTrack = null
	}

	dispose(): void {
		if (this.disposed) {
			return
		}
		this.disposed = true
		this.tearDownMusic()
		if (this.context) {
			void this.context.close()
		}
		this.context = null
		this.masterGain = null
		this.musicGain = null
		this.fxGain = null
		this.announcerGain = null
		this.lastSfxAt.clear()
		this.lastStingerAt.clear()
	}

	private scheduleRecipe(
		steps: readonly SfxStep[],
		ctx: AudioEngine,
		target: AudioConnection
	): void {
		const t0 = ctx.currentTime
		for (const step of steps) {
			if (step.kind === 'tone') {
				this.scheduleTone(step, ctx, target, t0)
			} else {
				this.scheduleNoise(step, ctx, target, t0)
			}
		}
	}

	private scheduleTone(
		step: ToneStepLocal,
		ctx: AudioEngine,
		target: AudioConnection,
		t0: number
	): void {
		const start = t0 + (step.delay ?? 0)
		const end = start + step.attack + step.decay
		const osc = ctx.createOscillator()
		osc.type = step.type
		osc.frequency.setValueAtTime(step.freq, start)
		if (step.freqEnd !== undefined) {
			osc.frequency.exponentialRampToValueAtTime(Math.max(step.freqEnd, 1), end)
		}
		const gain = ctx.createGain()
		gain.gain.setValueAtTime(0.0001, start)
		gain.gain.linearRampToValueAtTime(step.volume, start + step.attack)
		gain.gain.exponentialRampToValueAtTime(0.0001, end)

		let head: AudioConnection = osc
		if (step.filter) {
			const filt = ctx.createBiquadFilter()
			filt.type = step.filter.type
			filt.frequency.value = step.filter.freq
			if (step.filter.q !== undefined) {
				filt.Q.value = step.filter.q
			}
			osc.connect(filt)
			head = filt
		}
		head.connect(gain)
		gain.connect(target)

		osc.start(start)
		osc.stop(end + 0.05)
	}

	private scheduleNoise(
		step: NoiseStepLocal,
		ctx: AudioEngine,
		target: AudioConnection,
		t0: number
	): void {
		const start = t0 + (step.delay ?? 0)
		const sampleRate = ctx.sampleRate
		const length = Math.max(1, Math.ceil(sampleRate * step.duration))
		const buffer = ctx.createBuffer(1, length, sampleRate)
		const data = buffer.getChannelData(0)
		for (let i = 0; i < length; i++) {
			data[i] = Math.random() * 2 - 1
		}

		const source = ctx.createBufferSource()
		source.buffer = buffer
		const filt = ctx.createBiquadFilter()
		filt.type = 'lowpass'
		filt.frequency.value = step.cutoff
		filt.Q.value = 0.5
		const gain = ctx.createGain()
		gain.gain.setValueAtTime(step.volume, start)
		gain.gain.exponentialRampToValueAtTime(0.0001, start + step.duration)

		source.connect(filt)
		filt.connect(gain)
		gain.connect(target)
		source.start(start)
		source.stop(start + step.duration + 0.02)
	}

	getBusGainForTesting(bus: AudioBus): AudioGain | null {
		switch (bus) {
			case 'master': {
				return this.masterGain
			}
			case 'music': {
				return this.musicGain
			}
			case 'fx': {
				return this.fxGain
			}
			case 'announcer': {
				return this.announcerGain
			}
			default: {
				return assertNever(bus)
			}
		}
	}
}

type ToneStepLocal = Extract<SfxStep, { kind: 'tone' }>
type NoiseStepLocal = Extract<SfxStep, { kind: 'noise' }>
