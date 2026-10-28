import { Option, Schema } from 'effect'
/**
 * Local-storage-backed persistence for in-place first-match onboarding.
 *
 * State is keyed by an `ONBOARDING_VERSION` so future revisions can reintroduce
 * onboarding when steps materially change. Bumping the version unsets the
 * "completed" flag for everyone — keep bumps deliberate.
 */

export const ONBOARDING_VERSION = 1

export type OnboardingProgress = {
	version: number
	completed: boolean
	selectedVillage?: boolean
	movedUnit?: boolean
	replayTurn?: number
}

export const ONBOARDING_STORAGE_KEY = `hexwardens.onboarding:v${ONBOARDING_VERSION}`
const SERVER_DEFAULT: OnboardingProgress = {
	version: ONBOARDING_VERSION,
	completed: false
}

const listeners = new Set<(progress: OnboardingProgress) => void>()

let cached: OnboardingProgress = { ...SERVER_DEFAULT }

const decodeStoredProgress = Schema.decodeUnknownOption(
	Schema.fromJsonString(
		Schema.Struct({
			version: Schema.Finite,
			completed: Schema.Boolean,
			selectedVillage: Schema.optionalKey(Schema.Boolean),
			movedUnit: Schema.optionalKey(Schema.Boolean),
			replayTurn: Schema.optionalKey(Schema.Finite)
		})
	)
)

function readFromStorage(): OnboardingProgress {
	if (typeof localStorage === 'undefined') {
		return SERVER_DEFAULT
	}
	const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
	if (raw === null) {
		return SERVER_DEFAULT
	}
	const parsed = Option.getOrElse(
		decodeStoredProgress(raw),
		() => SERVER_DEFAULT
	)
	return parsed.version === ONBOARDING_VERSION ? parsed : SERVER_DEFAULT
}

/**
 * Returns a stable cached reference so `useSyncExternalStore` doesn't see a
 * different snapshot on every render. The cache is invalidated only when the
 * stored value materially changes.
 */
export function getOnboardingProgress(): OnboardingProgress {
	const fresh = readFromStorage()
	if (
		cached.version === fresh.version &&
		cached.completed === fresh.completed &&
		cached.selectedVillage === fresh.selectedVillage &&
		cached.movedUnit === fresh.movedUnit &&
		cached.replayTurn === fresh.replayTurn
	) {
		return cached
	}
	cached = fresh
	return cached
}

export function isOnboardingCompleted(): boolean {
	return getOnboardingProgress().completed
}

export function setOnboardingCompleted(completed: boolean): void {
	const next: OnboardingProgress = {
		version: ONBOARDING_VERSION,
		completed
	}
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next))
	}
	cached = next
	for (const listener of listeners) {
		listener(next)
	}
}

export function resetOnboardingProgress(): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(ONBOARDING_STORAGE_KEY)
	}
	const next: OnboardingProgress = {
		version: ONBOARDING_VERSION,
		completed: false
	}
	cached = next
	for (const listener of listeners) {
		listener(next)
	}
}

export function subscribeOnboardingProgress(
	listener: (progress: OnboardingProgress) => void
): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

function commitLessonProgress(next: OnboardingProgress): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next))
	}
	cached = next
	for (const listener of listeners) {
		listener(next)
	}
}

export function recordOnboardingSelection(): void {
	const progress = getOnboardingProgress()
	if (progress.completed || progress.selectedVillage) {
		return
	}
	commitLessonProgress({ ...progress, selectedVillage: true })
}

export function recordOnboardingMovement(): void {
	const progress = getOnboardingProgress()
	if (progress.completed || progress.movedUnit) {
		return
	}
	commitLessonProgress({ ...progress, selectedVillage: true, movedUnit: true })
}

export function replayOnboarding(turn: number): void {
	commitLessonProgress({
		version: ONBOARDING_VERSION,
		completed: false,
		replayTurn: turn
	})
}
