import { bloodlustAbility } from './bloodlust'
import { escapeAbility } from './escape'
import { hexCurseAbility } from './hex-curse'
import { heroMoraleAbilities } from './hero-morale'
import { mirageAbility } from './mirage'
import { rampageAbility } from './rampage'
import { type UnitAbility } from './registry'

/**
 * The single registry of unit abilities consumed by the combat resolver.
 *
 * The resolver owns phase order. `beforeCounter` handles counter dodges;
 * `postHit` handles surviving targets after landed hits. Death hooks receive
 * whether the lethal hit was a counter. Within a phase, hooks run in registry
 * order and match their relevant unit types.
 *
 * The registry is the *only* place that mentions unit-specific combat
 * behaviour. To add a new ability:
 *   1. Add a new file under `abilities/` exporting an `UnitAbility`.
 *   2. Append it to this list.
 *   3. Add a per-ability test next to its definition.
 */
export const unitAbilities: ReadonlyArray<UnitAbility> = [
	mirageAbility,
	hexCurseAbility,
	bloodlustAbility,
	escapeAbility,
	rampageAbility,
	...heroMoraleAbilities
] as const
