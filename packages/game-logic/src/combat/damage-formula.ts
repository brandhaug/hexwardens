/** Piecewise health-to-force curve with float32 arithmetic. */
function healthForce(health: number, maxHealth: number): number {
	const ratio =
		maxHealth > 0
			? Math.fround(Math.max(0, Math.min(1, health / maxHealth)))
			: 0
	if (ratio <= Math.fround(0.2)) {
		return Math.fround(0.1)
	}
	if (ratio <= 0.5) {
		return Math.fround(
			Math.fround(0.1) +
				Math.fround(Math.fround(2 / 3) * Math.fround(ratio - Math.fround(0.2)))
		)
	}
	return Math.fround(
		Math.fround(0.3) + Math.fround(Math.fround(1.4) * Math.fround(ratio - 0.5))
	)
}

export function calculateDamage(
	attack: number,
	defense: number,
	attackerHealth: number,
	attackerMaxHealth: number,
	defenderHealth: number,
	defenderMaxHealth: number
): number {
	if (attack <= 0 || attackerHealth <= 0) {
		return 0
	}
	const attackForce = Math.fround(
		attack * healthForce(attackerHealth, attackerMaxHealth)
	)
	const defenseForce = Math.fround(
		Math.max(0, defense) * healthForce(defenderHealth, defenderMaxHealth)
	)
	const share = Math.fround(
		attackForce / Math.fround(attackForce + defenseForce)
	)
	const raw = Math.fround(
		Math.fround(Math.fround(share * attack) * Math.fround(1.8)) + 0.5
	)
	return Math.floor(raw + 0.5)
}
