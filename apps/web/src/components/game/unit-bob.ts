export interface UnitBobOffset {
	readonly y: number
	readonly yaw: number
}

export function unitBobOffset(
	timeSeconds: number,
	isHero: boolean,
	reducedMotion: boolean
): UnitBobOffset {
	if (reducedMotion) {
		return { y: 0, yaw: 0 }
	}
	const amplitude = isHero ? 0.035 : 0.02
	return {
		y: Math.sin(timeSeconds * 2.4) * amplitude,
		yaw: Math.sin(timeSeconds * 0.9) * 0.08
	}
}
