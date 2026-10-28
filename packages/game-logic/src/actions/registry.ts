import { type ActionContext, type WorldActionExecutor } from './actions'
import {
	executeBuild,
	inspectBuild,
	planBuild,
	previewBuild
} from './features/build-structure/plan'
import {
	executeCapture,
	inspectCapture,
	planCapture,
	previewCapture
} from './features/capture/plan'
import {
	executeCollect,
	inspectCollect,
	planCollect,
	previewCollect
} from './features/collect/plan'
import {
	executeExplore,
	inspectExplore,
	planExplore,
	previewExplore
} from './features/explore/plan'
import {
	executeHeal,
	inspectHeal,
	planHeal,
	previewHeal
} from './features/heal/plan'
import {
	executeRecover,
	inspectRecover,
	planRecover,
	previewRecover
} from './features/recover/plan'
import {
	executeResearch,
	planResearch,
	previewResearch
} from './features/research/plan'
import {
	executeRetire,
	inspectRetire,
	planRetire,
	previewRetire
} from './features/retire/plan'
import {
	executeSelectPerk,
	planSelectPerk,
	previewSelectPerk
} from './features/select-perk/plan'
import { executeTrain, planTrain, previewTrain } from './features/train/plan'
import {
	executeUpgradeToLarge,
	inspectUpgradeToLarge,
	planUpgradeToLarge,
	previewUpgradeToLarge
} from './features/upgrade-to-large/plan'
import {
	type ActionInspection,
	type ActionIntent,
	type ActionPlan,
	type ActionPreview
} from './intent'

type ActionFeature = {
	kind: ActionIntent['kind']
	inspect?: (context: ActionContext) => ActionInspection | null
	preview: (context: ActionContext) => readonly ActionPreview[]
	plan: (intent: ActionIntent, context: ActionContext) => ActionPlan
	execute: WorldActionExecutor
}

function invalidKind(intent: ActionIntent): ActionPlan {
	return {
		kind: 'denied',
		intent,
		reason: {
			kind: 'invalidIntent',
			detail: `Action registry received mismatched intent: ${intent.kind}`
		}
	}
}

function simplePreview(
	preview: (context: ActionContext) => ActionPreview | null
): (context: ActionContext) => readonly ActionPreview[] {
	return (context) => {
		const option = preview(context)
		return option ? [option] : []
	}
}

export const actionFeatures: readonly ActionFeature[] = [
	{
		kind: 'build',
		execute: executeBuild,
		inspect: inspectBuild,
		preview: simplePreview(previewBuild),
		plan: (intent, context) =>
			intent.kind === 'build' ? planBuild(intent, context) : invalidKind(intent)
	},
	{
		kind: 'capture',
		execute: executeCapture,
		inspect: inspectCapture,
		preview: simplePreview(previewCapture),
		plan: (intent, context) =>
			intent.kind === 'capture'
				? planCapture(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'collect',
		execute: executeCollect,
		inspect: inspectCollect,
		preview: simplePreview(previewCollect),
		plan: (intent, context) =>
			intent.kind === 'collect'
				? planCollect(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'explore',
		execute: executeExplore,
		inspect: inspectExplore,
		preview: simplePreview(previewExplore),
		plan: (intent, context) =>
			intent.kind === 'explore'
				? planExplore(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'heal',
		execute: executeHeal,
		inspect: inspectHeal,
		preview: simplePreview(previewHeal),
		plan: (intent, context) =>
			intent.kind === 'heal' ? planHeal(intent, context) : invalidKind(intent)
	},
	{
		kind: 'recover',
		execute: executeRecover,
		inspect: inspectRecover,
		preview: simplePreview(previewRecover),
		plan: (intent, context) =>
			intent.kind === 'recover'
				? planRecover(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'retire',
		execute: executeRetire,
		inspect: inspectRetire,
		preview: simplePreview(previewRetire),
		plan: (intent, context) =>
			intent.kind === 'retire'
				? planRetire(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'upgrade-to-large',
		execute: executeUpgradeToLarge,
		inspect: inspectUpgradeToLarge,
		preview: simplePreview(previewUpgradeToLarge),
		plan: (intent, context) =>
			intent.kind === 'upgrade-to-large'
				? planUpgradeToLarge(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'train',
		execute: executeTrain,
		preview: previewTrain,
		plan: (intent, context) =>
			intent.kind === 'train' ? planTrain(intent, context) : invalidKind(intent)
	},
	{
		kind: 'research',
		execute: executeResearch,
		preview: previewResearch,
		plan: (intent, context) =>
			intent.kind === 'research'
				? planResearch(intent, context)
				: invalidKind(intent)
	},
	{
		kind: 'selectPerk',
		execute: executeSelectPerk,
		preview: previewSelectPerk,
		plan: (intent, context) =>
			intent.kind === 'selectPerk'
				? planSelectPerk(intent, context)
				: invalidKind(intent)
	}
]

export function featureFor(kind: ActionIntent['kind']): ActionFeature {
	for (const feature of actionFeatures) {
		if (feature.kind === kind) {
			return feature
		}
	}
	throw new Error(`No action feature registered for ${kind}`)
}
