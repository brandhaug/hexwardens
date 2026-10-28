import { Board } from '../../../board/board'
import { availableActions, executePlan, planAction } from '../../engine'
import { type ActionIntent } from '../../intent'
import { type Tech } from '../../../domains/tech'
import { type PrimaryBuildingValue } from '../../../domains/primary-building'
import { type SecondaryBuildingValue } from '../../../domains/secondary-building'
import { type ResourceValue } from '../../../domains/resource'
import { updateTile, type TileState } from '../../../tile/tile'
import {
	createTestBoard,
	createTestGameState,
	createTestVillage,
	requireTestValue
} from '../../../test/game-test-helpers'

const at = { q_idx: 2, r_idx: 2 }
const city = { q_idx: 1, r_idx: 2 }
function setup(item: TileState['item'], techs: Tech[] = [], money = 20) {
	const board = createTestBoard(2)
	requireTestValue(board[2])[2] = {
		...requireTestValue(board[2]?.[2]),
		terrain: 'stone',
		item
	}
	requireTestValue(board[2])[1] = {
		...requireTestValue(board[2]?.[1]),
		item: createTestVillage('barbarians', {
			level: 3,
			experienceToNextLevel: 4
		})
	}
	const state = createTestGameState({ board })
	state.playerStates.barbarians = {
		...requireTestValue(state.playerStates.barbarians),
		money,
		researchedTechs: techs
	}
	return state
}
function commit(state: ReturnType<typeof setup>, intent: ActionIntent) {
	const plan = planAction(state, intent)
	assert(plan.kind === 'allowed')
	expect(plan.cost.gold).toBe(5)
	const result = executePlan(state, plan).state
	expect(result.playerStates.barbarians?.money).toBe(15)
	expect(result.units.board[city.r_idx]?.[city.q_idx]?.item).toMatchObject({
		experience: 2,
		level: 3
	})
	return result
}
const buildingPaths: {
	primary: PrimaryBuildingValue
	secondary: SecondaryBuildingValue
	primaryTech: Tech
	secondaryTech: Tech
	mastery: Tech
}[] = [
	{
		primary: 'tavern',
		secondary: 'dock',
		primaryTech: 'coral_reef',
		secondaryTech: 'fish_farm',
		mastery: 'water_mastery'
	},
	{
		primary: 'farm',
		secondary: 'windmill',
		primaryTech: 'farming',
		secondaryTech: 'windmill',
		mastery: 'plant_mastery'
	},
	{
		primary: 'lumber mill',
		secondary: 'watermill',
		primaryTech: 'lumber_mill',
		secondaryTech: 'paper_mill',
		mastery: 'earth_mastery'
	},
	{
		primary: 'camp',
		secondary: 'stables',
		primaryTech: 'camp',
		secondaryTech: 'pasture',
		mastery: 'fire_mastery'
	},
	{
		primary: 'mine',
		secondary: 'blacksmith',
		primaryTech: 'mine',
		secondaryTech: 'quarry',
		mastery: 'mineral_mastery'
	}
]
describe.each(buildingPaths)('$primary economy path', (path) => {
	it(`requires ${path.primaryTech} to build ${path.primary} and awards two development`, () => {
		const item = {
			type: 'primaryBuilding',
			value: path.primary,
			state: 'idle',
			tribe: null
		} satisfies TileState['item']
		const locked = setup(item)
		expect(planAction(locked, { kind: 'build', at })).toMatchObject({
			kind: 'denied',
			reason: { kind: 'missingTech', tech: path.primaryTech }
		})
		expect(
			availableActions(locked, 'barbarians', at).some(
				(plan) => plan.intent.kind === 'build'
			)
		).toBe(false)
		commit(setup(item, [path.primaryTech]), { kind: 'build', at })
		expect(
			planAction(setup(item, [path.primaryTech], 4), { kind: 'build', at })
		).toMatchObject({ kind: 'denied', reason: { kind: 'insufficientFunds' } })
	})

	it(`requires ${path.secondaryTech} to build ${path.secondary}`, () => {
		const base = setup(null)
		const locked = {
			...base,
			units: {
				...base.units,
				board: updateTile(
					base.units.board,
					{ q_idx: 2, r_idx: 1 },
					{
						item: {
							type: 'primaryBuilding',
							value: path.primary,
							state: 'built',
							tribe: 'barbarians'
						}
					}
				)
			}
		}
		expect(planAction(locked, { kind: 'build', at })).toMatchObject({
			kind: 'denied',
			reason: { kind: 'missingTech', tech: path.secondaryTech }
		})
		const player = requireTestValue(locked.playerStates.barbarians)
		locked.playerStates.barbarians = {
			...player,
			researchedTechs: [path.secondaryTech]
		}
		commit(locked, { kind: 'build', at })
	})

	it(`requires ${path.mastery} to upgrade ${path.secondary} and awards two development`, () => {
		const item = {
			type: 'secondaryBuilding',
			value: path.secondary,
			state: 'built',
			tribe: 'barbarians'
		} satisfies TileState['item']
		expect(
			planAction(setup(item), { kind: 'upgrade-to-large', at })
		).toMatchObject({
			kind: 'denied',
			reason: { kind: 'missingTech', tech: path.mastery }
		})
		commit(setup(item, [path.mastery]), { kind: 'upgrade-to-large', at })
	})
})

const harvestPaths: { resource: ResourceValue; tech: Tech }[] = [
	{ resource: 'apple', tech: 'fruit_harvesting' },
	{ resource: 'leather', tech: 'meat_harvesting' },
	{ resource: 'pearl', tech: 'clam_harvesting' },
	{ resource: 'gem', tech: 'gem' },
	{ resource: 'granite', tech: 'cheese' }
]

it.each(harvestPaths)(
	'requires $tech for $resource and charges two gold without rebates',
	({ resource, tech }) => {
		const item = {
			type: 'resource',
			value: resource
		} satisfies TileState['item']
		expect(planAction(setup(item), { kind: 'collect', at })).toMatchObject({
			kind: 'denied',
			reason: { kind: 'missingTech', tech }
		})
		const state = setup(item, [tech, 'fruit_harvesting', 'mine'])
		const plan = planAction(state, { kind: 'collect', at })
		assert(plan.kind === 'allowed')
		expect(executePlan(state, plan).state.playerStates.barbarians?.money).toBe(
			18
		)
	}
)

it('preserves ungated wheat openings and rejects insufficient harvest funds', () => {
	const item = { type: 'resource', value: 'wheat' } satisfies TileState['item']
	expect(planAction(setup(item), { kind: 'collect', at }).kind).toBe('allowed')
	expect(planAction(setup(item, [], 1), { kind: 'collect', at })).toMatchObject(
		{ kind: 'denied', reason: { kind: 'insufficientFunds' } }
	)
})

const adjacentBuildCases: {
	techs: Tech[]
	expected: 'windmill' | 'watermill'
}[] = [
	{ techs: ['windmill'], expected: 'windmill' },
	{ techs: ['paper_mill'], expected: 'watermill' },
	{ techs: ['windmill', 'paper_mill'], expected: 'windmill' }
]

it.each(adjacentBuildCases)(
	'selects $expected with adjacent farm and lumber mill when researched techs are $techs',
	({ techs, expected }) => {
		const state = setupAdjacentBuildings(techs)
		const plan = planAction(state, { kind: 'build', at })
		const offered = availableActions(state, 'barbarians', at).find(
			(action) => action.intent.kind === 'build'
		)
		expect(plan.kind).toBe('allowed')
		assert(plan.kind === 'allowed')
		expect(plan.preview.label.toLowerCase()).toBe(`build ${expected}`)
		expect(offered?.preview).toEqual(plan.preview)
		const result = executePlan(state, plan).state
		expect(result.units.board[at.r_idx]?.[at.q_idx]?.item).toMatchObject({
			type: 'secondaryBuilding',
			value: expected,
			state: 'built',
			tribe: 'barbarians'
		})
		expect(result.playerStates.barbarians?.money).toBe(15)
	}
)

function setupAdjacentBuildings(techs: Tech[]) {
	const base = setup(null, techs)
	const neighbors = Board.from(base.units.board)
		.neighborsOf(at)
		.filter(
			(position) =>
				position.q_idx !== city.q_idx || position.r_idx !== city.r_idx
		)
	const farmPosition = requireTestValue(neighbors[0])
	const lumberPosition = requireTestValue(neighbors[1])
	const withFarm = updateTile(base.units.board, farmPosition, {
		item: {
			type: 'primaryBuilding',
			value: 'farm',
			state: 'built',
			tribe: 'barbarians'
		}
	})
	const board = updateTile(withFarm, lumberPosition, {
		item: {
			type: 'primaryBuilding',
			value: 'lumber mill',
			state: 'built',
			tribe: 'barbarians'
		}
	})
	return { ...base, units: { ...base.units, board } }
}

it('explains missing technology when neither adjacent building is unlocked', () => {
	const state = setupAdjacentBuildings([])
	expect(planAction(state, { kind: 'build', at })).toMatchObject({
		kind: 'denied',
		reason: { kind: 'missingTech', tech: 'windmill' }
	})
	expect(
		availableActions(state, 'barbarians', at).find(
			(action) => action.intent.kind === 'build'
		)
	).toBeUndefined()
})
