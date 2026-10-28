import { type SfxName, type StingerName } from './audio-events'

/**
 * Each SFX is a list of one-shot oscillator or noise primitives. The shape
 * is purely declarative — `AudioManager` walks the list and constructs the
 * underlying `OscillatorNode` / `AudioBufferSourceNode` graph at play
 * time. Picking declarative-over-imperative recipes is what lets the
 * mapping table be testable without touching `AudioContext`.
 */
export type SfxStep = ToneStep | NoiseStep

export interface ToneStep {
	kind: 'tone'
	freq: number
	freqEnd?: number
	type: OscillatorType
	volume: number
	attack: number
	decay: number
	delay?: number
	filter?: { type: BiquadFilterType; freq: number; q?: number }
}

export interface NoiseStep {
	kind: 'noise'
	duration: number
	volume: number
	cutoff: number
	delay?: number
}

const sfxRecipes: Record<SfxName, readonly SfxStep[]> = {
	// UI-facing — short, low-priority — not gameplay-driven.
	select: [
		{
			kind: 'tone',
			freq: 660,
			type: 'sine',
			volume: 0.18,
			attack: 0.005,
			decay: 0.08
		}
	],
	deselect: [
		{
			kind: 'tone',
			freq: 440,
			type: 'sine',
			volume: 0.12,
			attack: 0.005,
			decay: 0.06
		}
	],
	move: [
		{
			kind: 'tone',
			freq: 320,
			type: 'triangle',
			volume: 0.18,
			attack: 0.002,
			decay: 0.07,
			filter: { type: 'lowpass', freq: 1200, q: 0.7 }
		},
		{ kind: 'noise', duration: 0.06, volume: 0.08, cutoff: 1100, delay: 0.02 }
	],
	action: [
		{
			kind: 'tone',
			freq: 520,
			type: 'triangle',
			volume: 0.16,
			attack: 0.003,
			decay: 0.07
		},
		{
			kind: 'tone',
			freq: 720,
			type: 'triangle',
			volume: 0.14,
			attack: 0.003,
			decay: 0.09,
			delay: 0.06
		}
	],
	turnEnd: [
		{
			kind: 'tone',
			freq: 440,
			type: 'sine',
			volume: 0.14,
			attack: 0.01,
			decay: 0.12
		},
		{
			kind: 'tone',
			freq: 550,
			type: 'sine',
			volume: 0.14,
			attack: 0.01,
			decay: 0.12,
			delay: 0.1
		},
		{
			kind: 'tone',
			freq: 660,
			type: 'sine',
			volume: 0.12,
			attack: 0.01,
			decay: 0.16,
			delay: 0.2
		}
	],
	// Combat — sharp, transient, no melodic shape.
	unitDamage: [
		{
			kind: 'tone',
			freq: 220,
			freqEnd: 90,
			type: 'sawtooth',
			volume: 0.22,
			attack: 0.001,
			decay: 0.16,
			filter: { type: 'lowpass', freq: 800, q: 1 }
		},
		{ kind: 'noise', duration: 0.06, volume: 0.18, cutoff: 1800 }
	],
	unitDeath: [
		{
			kind: 'tone',
			freq: 180,
			freqEnd: 50,
			type: 'sawtooth',
			volume: 0.28,
			attack: 0.005,
			decay: 0.55,
			filter: { type: 'lowpass', freq: 480, q: 0.7 }
		},
		{
			kind: 'tone',
			freq: 90,
			freqEnd: 35,
			type: 'sine',
			volume: 0.2,
			attack: 0.01,
			decay: 0.6,
			delay: 0.04
		},
		{ kind: 'noise', duration: 0.18, volume: 0.16, cutoff: 600, delay: 0.02 }
	],
	// Capture — softer, two-tone confirmation. The capital stinger is on
	// the announcer chain and is defined separately.
	villageCaptured: [
		{
			kind: 'tone',
			freq: 392,
			type: 'sine',
			volume: 0.22,
			attack: 0.005,
			decay: 0.18
		},
		{
			kind: 'tone',
			freq: 523.25,
			type: 'sine',
			volume: 0.22,
			attack: 0.005,
			decay: 0.22,
			delay: 0.1
		},
		{
			kind: 'tone',
			freq: 784,
			type: 'sine',
			volume: 0.16,
			attack: 0.005,
			decay: 0.32,
			delay: 0.22
		}
	],
	// Research — bright, sustained chord stab.
	techComplete: [
		{
			kind: 'tone',
			freq: 880,
			type: 'sine',
			volume: 0.16,
			attack: 0.005,
			decay: 0.25
		},
		{
			kind: 'tone',
			freq: 1320,
			type: 'sine',
			volume: 0.1,
			attack: 0.008,
			decay: 0.32,
			delay: 0.05
		},
		{
			kind: 'tone',
			freq: 2640,
			type: 'triangle',
			volume: 0.06,
			attack: 0.01,
			decay: 0.35,
			delay: 0.1
		}
	],
	// Build — wooden double-tap, mostly mid-band noise.
	buildComplete: [
		{
			kind: 'tone',
			freq: 360,
			type: 'square',
			volume: 0.16,
			attack: 0.001,
			decay: 0.05,
			filter: { type: 'bandpass', freq: 600, q: 4 }
		},
		{ kind: 'noise', duration: 0.04, volume: 0.14, cutoff: 1400, delay: 0.06 },
		{
			kind: 'tone',
			freq: 280,
			type: 'square',
			volume: 0.14,
			attack: 0.001,
			decay: 0.07,
			delay: 0.12,
			filter: { type: 'bandpass', freq: 480, q: 4 }
		}
	],
	// Level up — ascending major triad, brighter than build.
	levelUp: [
		{
			kind: 'tone',
			freq: 523.25,
			type: 'triangle',
			volume: 0.2,
			attack: 0.005,
			decay: 0.18
		},
		{
			kind: 'tone',
			freq: 659.25,
			type: 'triangle',
			volume: 0.2,
			attack: 0.005,
			decay: 0.22,
			delay: 0.1
		},
		{
			kind: 'tone',
			freq: 783.99,
			type: 'triangle',
			volume: 0.18,
			attack: 0.005,
			decay: 0.32,
			delay: 0.22
		}
	],
	// Enemy turn — soft low pulse, easy to ignore but noticeable.
	enemyTurnStart: [
		{
			kind: 'tone',
			freq: 220,
			type: 'sine',
			volume: 0.16,
			attack: 0.04,
			decay: 0.4,
			filter: { type: 'lowpass', freq: 600, q: 0.5 }
		}
	],
	// Your turn — warm rising fourth, brighter and shorter than the enemy
	// pulse. It pairs with the "Your Move" banner: an invitation, not an
	// alarm, so triangle waves and gentle attacks.
	yourTurnStart: [
		{
			kind: 'tone',
			freq: 392,
			type: 'triangle',
			volume: 0.16,
			attack: 0.01,
			decay: 0.16
		},
		{
			kind: 'tone',
			freq: 523.25,
			type: 'triangle',
			volume: 0.16,
			attack: 0.01,
			decay: 0.28,
			delay: 0.11
		}
	],
	// Endgame fanfares — hold the existing shape (player muscle memory).
	victory: [
		{
			kind: 'tone',
			freq: 523,
			type: 'triangle',
			volume: 0.2,
			attack: 0.01,
			decay: 0.18
		},
		{
			kind: 'tone',
			freq: 659,
			type: 'triangle',
			volume: 0.2,
			attack: 0.01,
			decay: 0.18,
			delay: 0.15
		},
		{
			kind: 'tone',
			freq: 784,
			type: 'triangle',
			volume: 0.2,
			attack: 0.01,
			decay: 0.22,
			delay: 0.3
		},
		{
			kind: 'tone',
			freq: 1047,
			type: 'triangle',
			volume: 0.18,
			attack: 0.01,
			decay: 0.32,
			delay: 0.5
		}
	],
	defeat: [
		{
			kind: 'tone',
			freq: 400,
			type: 'sine',
			volume: 0.18,
			attack: 0.01,
			decay: 0.22
		},
		{
			kind: 'tone',
			freq: 300,
			type: 'sine',
			volume: 0.18,
			attack: 0.01,
			decay: 0.22,
			delay: 0.2
		},
		{
			kind: 'tone',
			freq: 200,
			type: 'sine',
			volume: 0.14,
			attack: 0.01,
			decay: 0.45,
			delay: 0.4
		}
	],
	// Bright fourth-fifth chord — short stinger paired with the unlock toast.
	achievement: [
		{
			kind: 'tone',
			freq: 784,
			type: 'triangle',
			volume: 0.16,
			attack: 0.005,
			decay: 0.18
		},
		{
			kind: 'tone',
			freq: 1047,
			type: 'triangle',
			volume: 0.16,
			attack: 0.005,
			decay: 0.18,
			delay: 0.05
		},
		{
			kind: 'tone',
			freq: 1568,
			type: 'triangle',
			volume: 0.14,
			attack: 0.005,
			decay: 0.24,
			delay: 0.12
		}
	]
}

export function getSfxRecipe(name: SfxName): readonly SfxStep[] {
	return sfxRecipes[name]
}

/**
 * Stinger recipes — these run through the announcer DSP chain
 * (`announcer-chain.ts`). The recipe shape is identical to SFX so the
 * synthesiser can reuse the same primitive walker; the routing target is
 * decided by the caller.
 */
const stingerRecipes: Record<StingerName, readonly SfxStep[]> = {
	// Capital captured — open fifth + octave, slow attack, long sustain.
	// The DSP chain (highpass + presence + delay + compressor) gives it
	// the radio-broadcast feel that signals "this is a big deal."
	capitalCaptured: [
		{
			kind: 'tone',
			freq: 196,
			type: 'sine',
			volume: 0.45,
			attack: 0.04,
			decay: 1.4
		},
		{
			kind: 'tone',
			freq: 293.66,
			type: 'sine',
			volume: 0.4,
			attack: 0.05,
			decay: 1.4,
			delay: 0.04
		},
		{
			kind: 'tone',
			freq: 392,
			type: 'triangle',
			volume: 0.3,
			attack: 0.06,
			decay: 1.5,
			delay: 0.08
		},
		{
			kind: 'tone',
			freq: 587.33,
			type: 'sine',
			volume: 0.18,
			attack: 0.08,
			decay: 1.6,
			delay: 0.12
		}
	]
}

export function getStingerRecipe(name: StingerName): readonly SfxStep[] {
	return stingerRecipes[name]
}
