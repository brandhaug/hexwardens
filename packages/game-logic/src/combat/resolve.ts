import { Result } from 'effect'
import { Board, type BoardPosition } from '../board/board'
import { type Unit, type UnitMode, type UnitType } from '../domains/unit'
import { createGameWorld } from '../engine/world'
import { type GameWorld } from '../engine/world-contract'
import { type GameState } from '../game'
import { recordWorldKill } from '../units/world-units'
import { unitAbilities } from './abilities/abilities'
import { applyKnockback } from './abilities/knockback'
import {
	type UnitAbility,
	type PreDamageHook,
	type BeforeCounterHook,
	type PostHitHook,
	type DeathHook,
	type DamageCtx
} from './abilities/registry'
import { computeDamage } from './modifiers'
import { canAttack } from './range'
import { swapRoles, validate, type CombatState } from './state'
import {
	type AttackIntent,
	type CombatError,
	type CombatEvent,
	type CombatPreview,
	type CombatResolution
} from './types'

function runHooks<C>(
	initial: C,
	pick: (ability: UnitAbility) => ((ctx: C) => C) | undefined,
	stop?: (ctx: C) => boolean
): C {
	let context = initial
	for (const ability of unitAbilities) {
		const hook = pick(ability)
		if (!hook) {
			continue
		}
		context = hook(context)
		if (stop?.(context)) {
			break
		}
	}
	return context
}

type Striker = {
	id: Unit['id']
	pos: BoardPosition
	range: number
	hpBeforeKill: number
	type: UnitType
	occupyOnKill?: boolean
}
type Hit = {
	killed: boolean
	attackerFinalPos: BoardPosition
	events: readonly CombatEvent[]
}

function death(
	world: GameWorld,
	attacker: Striker,
	victim: { unit: Unit; pos: BoardPosition },
	isCounter: boolean
): void {
	runHooks<DeathHook>(
		{
			world,
			victim,
			killer: {
				unitId: attacker.id,
				type: attacker.type,
				hpBeforeKill: attacker.hpBeforeKill,
				pos: attacker.pos
			},
			isCounter
		},
		(ability) => ability.hooks.onDeath
	)
}

function hit(
	world: GameWorld,
	attacker: Striker,
	defender: { unit: Unit; pos: BoardPosition },
	damage: number,
	isCounter = false
): Hit {
	const target = world.unit(defender.unit.id)
	if (!target) {
		throw new Error(`applyHit: no UnitState for defender ${defender.unit.id}`)
	}
	const health = target.state.health - damage
	if (health > 0) {
		world.updateUnit(target.unit.id, { health })
		return { killed: false, attackerFinalPos: attacker.pos, events: [] }
	}
	world.removeUnit(target.unit.id)
	recordWorldKill(world, attacker.id)
	death(world, attacker, defender, isCounter)
	const occupy = attacker.range <= 1 && attacker.occupyOnKill !== false
	if (occupy) {
		world.moveUnit(attacker.id, defender.pos)
	}
	return {
		killed: true,
		attackerFinalPos: occupy ? defender.pos : attacker.pos,
		events: [
			{ type: 'kill', killerId: attacker.id, victimId: defender.unit.id }
		]
	}
}

function striker(state: CombatState, pos = state.attacker.pos): Striker {
	return {
		id: state.attacker.unit.id,
		pos,
		range: state.attacker.stats.range,
		hpBeforeKill: state.attacker.state.health,
		type: state.attacker.unit.type
	}
}

function collateral(
	world: GameWorld,
	state: CombatState,
	damage: number,
	attackerPos: BoardPosition
): CombatEvent[] {
	const events: CombatEvent[] = []
	if (state.attacker.stats.specialAttackAttribute === 'aoe through') {
		const q = state.defender.pos.q_idx - state.attacker.pos.q_idx
		const r = state.defender.pos.r_idx - state.attacker.pos.r_idx
		if (q === 0 || r === 0 || q + r === 0) {
			const pos = {
				q_idx: state.defender.pos.q_idx + Math.sign(q),
				r_idx: state.defender.pos.r_idx + Math.sign(r)
			}
			const unit = world.tile(pos)?.unit
			if (
				unit &&
				unit.tribe !== state.attacker.unit.tribe &&
				world.unit(unit.id)
			) {
				events.push(
					{
						type: 'attack',
						attackerId: state.attacker.unit.id,
						defenderId: unit.id,
						damage
					},
					...hit(
						world,
						{ ...striker(state, attackerPos), occupyOnKill: false },
						{ unit, pos },
						damage
					).events
				)
			}
		}
	}
	if (state.attacker.stats.passive === 'splash') {
		const board = Board.from(world.snapshot().units.board)
		const splash = Math.max(1, Math.floor(damage / 6))
		for (const pos of board.neighborsOf(state.defender.pos)) {
			const unit = world.tile(pos)?.unit
			if (
				!unit ||
				unit.tribe === state.attacker.unit.tribe ||
				unit.id === state.defender.unit.id ||
				!world.unit(unit.id)
			) {
				continue
			}
			events.push(
				{
					type: 'attack',
					attackerId: state.attacker.unit.id,
					defenderId: unit.id,
					damage: splash
				},
				...hit(world, striker(state), { unit, pos }, splash).events
			)
		}
	}
	return events
}

function postHit(
	world: GameWorld,
	state: CombatState,
	isCounter: boolean
): readonly CombatEvent[] {
	return runHooks<PostHitHook>(
		{
			world,
			state,
			events: [],
			isCounter,
			source: isCounter ? state.defender : state.attacker,
			target: isCounter ? state.attacker : state.defender
		},
		(ability) => ability.hooks.postHit
	).events
}

function counter(world: GameWorld, state: CombatState): WorldCombatResolution {
	const tile = world.tile(state.attacker.pos)
	if (
		!tile?.unit ||
		!canAttack(
			state.defender.unit,
			state.defender.pos,
			tile.unit,
			state.attacker.pos,
			state.grid.gameHex,
			state.grid.radius,
			state.defender.techs,
			state.defender.tile.terrain
		)
	) {
		return { events: [], message: '' }
	}
	const before = runHooks<BeforeCounterHook>(
		{ world, events: [], target: state.attacker },
		(ability) => ability.hooks.beforeCounter
	)
	if (
		before.events.some(
			(event) => event.type === 'dodge' && event.context === 'counter'
		)
	) {
		return {
			events: before.events,
			message:
				state.attacker.unit.type === 'skeleton_golem'
					? ' Skeleton Golem dodged the counter-attack!'
					: ''
		}
	}
	const defender = world.unit(state.defender.unit.id)
	if (!defender) {
		throw new Error(
			`resolveCombat: no UnitState for defender ${state.defender.unit.id}`
		)
	}
	const swapped = swapRoles(state, {
		gameState: world.snapshot(),
		newAttackerHealth: defender.state.health,
		newDefenderPos: state.attacker.pos,
		newDefenderTile: tile
	})
	const damage = computeDamage(swapped)
	const health = state.attacker.state.health - damage
	const events: CombatEvent[] = [
		{
			type: 'counter',
			attackerId: state.defender.unit.id,
			defenderId: state.attacker.unit.id,
			damage
		}
	]
	if (health <= 0) {
		events.push(
			...hit(
				world,
				{
					id: state.defender.unit.id,
					pos: state.defender.pos,
					range: state.defender.stats.range,
					hpBeforeKill: defender.state.health,
					type: state.defender.unit.type
				},
				{ unit: state.attacker.unit, pos: state.attacker.pos },
				damage,
				true
			).events
		)
		return {
			events,
			message: ` ${state.defender.unit.type} counter-attacked and killed ${state.attacker.unit.type}!`
		}
	}
	world.updateUnit(state.attacker.unit.id, { health })
	events.push(...postHit(world, state, true))
	return {
		events,
		message: ` ${state.defender.unit.type} counter-attacked for ${damage} damage. ${state.attacker.unit.type} has ${health} health left.`
	}
}

function modeAfterAttack(state: CombatState, killed: boolean): UnitMode {
	for (const ability of unitAbilities) {
		if (ability.unit !== state.attacker.unit.type) {
			continue
		}
		const mode = ability.hooks.modeAfterAttack?.({ state, killed })
		if (mode !== null && mode !== undefined) {
			return mode
		}
	}
	return 'acted'
}

export type WorldCombatResolution = Omit<CombatResolution, 'state'>

/** Mutates only the command's candidate; callers publish it after success. */
export function resolveWorldCombat(
	world: GameWorld,
	attack: AttackIntent
): Result.Result<WorldCombatResolution, CombatError> {
	const validation = validate(
		world.snapshot(),
		attack.from,
		attack.to,
		attack.grid
	)
	if (Result.isFailure(validation)) {
		return Result.fail(validation.failure)
	}
	const state = validation.success
	const pre = runHooks<PreDamageHook>(
		{ state, world, events: [], dodged: false, message: null },
		(ability) => ability.hooks.preDamage,
		(ctx) => ctx.dodged
	)
	if (pre.dodged) {
		return Result.succeed({ events: pre.events, message: pre.message ?? '' })
	}
	const damage = computeDamage(state)
	const onDamage = runHooks<DamageCtx>(
		{
			state,
			world,
			damage,
			events: [
				{
					type: 'attack',
					attackerId: state.attacker.unit.id,
					defenderId: state.defender.unit.id,
					damage
				}
			]
		},
		(ability) => ability.hooks.onDamage
	)
	const primary = hit(
		world,
		striker(state),
		{ unit: state.defender.unit, pos: state.defender.pos },
		damage
	)
	const events = [
		...onDamage.events,
		...primary.events,
		...collateral(world, state, damage, primary.attackerFinalPos)
	]
	let message: string
	if (primary.killed) {
		message =
			state.attacker.stats.range <= 1
				? `${state.attacker.unit.type} killed ${state.defender.unit.type} and took its position!`
				: `${state.attacker.unit.type} killed ${state.defender.unit.type} from range!`
	} else {
		const defender = world.unit(state.defender.unit.id)
		if (!defender) {
			throw new Error(
				`resolveCombat: no UnitState for defender ${state.defender.unit.id}`
			)
		}
		message = `${state.attacker.unit.type} attacked ${state.defender.unit.type} for ${damage} damage. ${state.defender.unit.type} has ${defender.state.health} health left.`
		const push = applyKnockback(state, world)
		events.push(...push.events)
		if (push.kill) {
			death(
				world,
				striker(state),
				{ unit: state.defender.unit, pos: push.kill.victimPos },
				false
			)
		}
		if (!push.targetRemoved && !push.targetMoved) {
			events.push(...postHit(world, state, false))
			const response = counter(world, state)
			events.push(...response.events)
			message += response.message
		}
	}
	if (world.unit(state.attacker.unit.id)) {
		world.updateUnit(state.attacker.unit.id, {
			mode: modeAfterAttack(state, primary.killed)
		})
	}
	return Result.succeed({ events, message })
}

export function resolveCombat(
	gameState: GameState,
	attack: AttackIntent
): Result.Result<CombatResolution, CombatError> {
	const world = createGameWorld(gameState)
	const result = resolveWorldCombat(world, attack)
	return Result.isFailure(result)
		? Result.fail(result.failure)
		: Result.succeed({ ...result.success, state: world.snapshot() })
}

export function previewCombat(
	gameState: GameState,
	attack: AttackIntent
): CombatPreview {
	const result = resolveCombat(gameState, attack)
	if (Result.isFailure(result)) {
		return { expected: 0, counter: null }
	}
	const attacker =
		gameState.units.board[attack.from.r_idx]?.[attack.from.q_idx]?.unit
	const defender =
		gameState.units.board[attack.to.r_idx]?.[attack.to.q_idx]?.unit
	const primary = result.success.events.find(
		(event) =>
			event.type === 'attack' &&
			event.attackerId === attacker?.id &&
			event.defenderId === defender?.id
	)
	const response = result.success.events.find(
		(event) => event.type === 'counter'
	)
	return {
		expected: primary?.type === 'attack' ? primary.damage : 0,
		counter: response?.type === 'counter' ? response.damage : null
	}
}
