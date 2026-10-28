import { TECH_NODE_WIDTH, TECH_NODE_HEIGHT } from './tech-node-layout'
import { constVoid } from 'effect/Function'
import { useMemo } from 'react'
import { ReactFlow, PanOnScrollMode, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { graphlib, layout } from '@dagrejs/dagre'
import {
	type Tech,
	techs,
	getResearchChoices,
	getTechNode
} from '@hexwardens/game-logic/domains/tech'

import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { TechNode, type TechNodeData } from './tech-node'

export interface TechTreeDisplayProps {
	researchedTechs?: readonly Tech[]
	researchInProgress?: { tech: Tech; turnsRemaining: number } | null
	currentTribe?: Tribe
	playerMoney?: number
	ownedVillages?: number
	onResearch?: ((tech: Tech) => void) | undefined
	className?: string
	showLegend?: boolean
}

type Extent = [[number, number], [number, number]]

function buildLayout(
	researchedTechs: readonly Tech[],
	researchInProgress: { tech: Tech; turnsRemaining: number } | null,
	currentTribe: Tribe | undefined,
	ownedVillages: number,
	playerMoney: number | undefined,
	onResearch?: (tech: Tech) => void
) {
	const g = new graphlib.Graph()
	g.setGraph({
		rankdir: 'LR',
		nodesep: 40,
		ranksep: 60,
		marginx: 20,
		marginy: 20
	})
	g.setDefaultEdgeLabel(() => ({}))

	const researchArgs: Parameters<typeof getResearchChoices>[0] = {
		researchedTechs,
		researchInProgress,
		ownedVillages
	}
	if (currentTribe !== undefined) {
		researchArgs.tribe = currentTribe
	}
	if (playerMoney !== undefined) {
		researchArgs.playerMoney = playerMoney
	}
	const choices = getResearchChoices(researchArgs)
	if (!onResearch) {
		for (const choice of choices) {
			if (choice.status === 'locked') {
				choice.status = 'available'
			}
		}
	}

	const choiceByTech = new Map(choices.map((choice) => [choice.tech, choice]))

	for (const tech of techs) {
		g.setNode(tech, { width: TECH_NODE_WIDTH, height: TECH_NODE_HEIGHT })
	}

	const edges: Edge[] = []
	for (const tech of techs) {
		const node = getTechNode(tech)
		for (const parent of node.parents) {
			const edgeId = `${parent}->${tech}`
			g.setEdge(parent, tech)

			const parentStatus = choiceByTech.get(parent)?.status ?? 'locked'
			const childStatus = choiceByTech.get(tech)?.status ?? 'locked'
			const isActive =
				onResearch && parentStatus === 'researched' && childStatus !== 'locked'

			const activeOpacity = isActive ? 1 : 0.3
			edges.push({
				id: edgeId,
				source: parent,
				target: tech,
				type: 'default',
				animated: childStatus === 'in-progress',
				style: {
					stroke: isActive
						? 'var(--color-green-500)'
						: 'var(--color-muted-foreground)',
					strokeWidth: isActive ? 2 : 1,
					opacity: onResearch ? activeOpacity : 0.6
				}
			})
		}
	}

	layout(g)

	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	const nodes: Node<TechNodeData>[] = techs.map((tech) => {
		const pos = g.node(tech)
		const choice = choiceByTech.get(tech)
		const node = getTechNode(tech)
		const status = choice?.status ?? 'locked'
		const x = pos.x - TECH_NODE_WIDTH / 2
		const y = pos.y - TECH_NODE_HEIGHT / 2
		if (x < minX) {
			minX = x
		}
		if (y < minY) {
			minY = y
		}
		if (x + TECH_NODE_WIDTH > maxX) {
			maxX = x + TECH_NODE_WIDTH
		}
		if (y + TECH_NODE_HEIGHT > maxY) {
			maxY = y + TECH_NODE_HEIGHT
		}
		return {
			id: tech,
			type: 'techNode',
			position: { x, y },
			data: {
				tech,
				status,
				cost: choice?.cost ?? node.cost,
				turnsToResearch: choice?.turnsToResearch ?? node.turnsToResearch,
				parents: [...node.parents],
				passiveDescription: choice?.passiveDescription ?? '',
				isAligned: choice?.isAligned ?? false,
				turnsRemaining: choice?.turnsRemaining ?? null,
				canAfford: choice?.canAfford ?? true,
				onResearch
			},
			draggable: false
		}
	})

	const padding = 80
	const extent: Extent = [
		[minX - padding, minY - padding],
		[maxX + padding, maxY + padding]
	]

	return { nodes, edges, extent }
}

const EMPTY_RESEARCHED_TECHS: Tech[] = []

const nodeTypes = { techNode: TechNode }

// Keeps pointer-events: all on non-draggable, non-selectable nodes so the Research button is clickable.
const noopNodeMouseEnter = constVoid

export function TechTreeDisplay({
	researchedTechs = EMPTY_RESEARCHED_TECHS,
	researchInProgress = null,
	currentTribe,
	playerMoney,
	ownedVillages = 1,
	onResearch,
	className = 'h-[75vh]',
	showLegend = true
}: TechTreeDisplayProps) {
	const { nodes, edges, extent } = useMemo(
		() =>
			buildLayout(
				researchedTechs,
				researchInProgress,
				currentTribe,
				ownedVillages,
				playerMoney,
				onResearch
			),
		[
			researchedTechs,
			researchInProgress,
			currentTribe,
			ownedVillages,
			playerMoney,
			onResearch
		]
	)

	return (
		<>
			<div className={className}>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					fitView
					fitViewOptions={{ padding: 0.15 }}
					translateExtent={extent}
					nodeExtent={extent}
					nodesDraggable={false}
					nodesConnectable={false}
					elementsSelectable={false}
					onNodeMouseEnter={noopNodeMouseEnter}
					panOnDrag
					panOnScroll
					panOnScrollMode={PanOnScrollMode.Vertical}
					zoomOnScroll={false}
					zoomOnPinch
					zoomOnDoubleClick={false}
					preventScrolling={false}
					proOptions={{ hideAttribution: true }}
				/>
			</div>
			{showLegend && (
				<div className='flex flex-wrap items-center gap-4 border-t px-4 py-3 text-muted-foreground text-xs'>
					{onResearch && (
						<>
							<span className='flex items-center gap-1.5'>
								<span className='inline-block size-3 rounded-sm bg-green-600' />
								Researched
							</span>
							<span className='flex items-center gap-1.5'>
								<span className='inline-block size-3 rounded-sm bg-amber-500' />
								In Progress
							</span>
							<span className='flex items-center gap-1.5'>
								<span className='inline-block size-3 rounded-sm border border-foreground/30 bg-card' />
								Available
							</span>
							<span className='flex items-center gap-1.5'>
								<span className='inline-block size-3 rounded-sm bg-muted' />
								Locked
							</span>
						</>
					)}
					{currentTribe && (
						<span className='flex items-center gap-1.5'>
							<span className='text-amber-400'>★</span>
							Tribe-aligned
						</span>
					)}
				</div>
			)}
		</>
	)
}
