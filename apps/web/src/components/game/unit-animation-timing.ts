export type CombatAnimationState = 'attack' | 'defend' | 'death'

/** Leave a short settling window after the skeletal clip finishes. */
export const combatAnimationTiming: Record<
	CombatAnimationState,
	{
		readonly durationMs: number
		readonly clipSeconds: number
	}
> = {
	attack: { durationMs: 520, clipSeconds: 0.42 },
	defend: { durationMs: 420, clipSeconds: 0.32 },
	death: { durationMs: 780, clipSeconds: 0.6 }
}

export function defeatScale(elapsedMs: number, reducedMotion: boolean): number {
	if (reducedMotion) {
		return 1
	}
	// Let the fall read before removing the piece. Clamp after a background-tab pause.
	const progress = Math.min(1, Math.max(0, (elapsedMs - 500) / 280))
	return 1 - progress * progress * (3 - 2 * progress)
}
