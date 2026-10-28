export type ShortcutScope = 'always' | 'inGame' | 'inMenu'

export interface ShortcutEntry {
	code: string
	description: string
	scope: ShortcutScope
	category?: string
	meta?: boolean
	shift?: boolean
	handler: () => void
}

export interface ShortcutGroup {
	category: string
	entries: ShortcutEntry[]
}

export interface ShortcutTarget {
	tagName: string
	isContentEditable: boolean
}

export interface ShortcutEvent {
	code: string
	metaKey: boolean
	ctrlKey: boolean
	shiftKey: boolean
	target: ShortcutTarget | null
}

export interface ShortcutContext {
	scope: 'inGame' | 'inMenu'
}

function isTypingTarget(target: ShortcutTarget | null): boolean {
	if (target === null) {
		return false
	}
	if (target.isContentEditable) {
		return true
	}
	return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)
}

function scopeMatches(entry: ShortcutEntry, context: ShortcutContext): boolean {
	return entry.scope === 'always' || entry.scope === context.scope
}

function modifiersMatch(entry: ShortcutEntry, event: ShortcutEvent): boolean {
	const entryWantsMeta = entry.meta === true
	const entryWantsShift = entry.shift === true
	const eventHasMeta = event.metaKey || event.ctrlKey
	return entryWantsMeta === eventHasMeta && entryWantsShift === event.shiftKey
}

function baseLabel(code: string): string {
	if (code === 'Escape') {
		return 'Esc'
	}
	if (code.startsWith('Key')) {
		return code.slice(3)
	}
	if (code.startsWith('Digit')) {
		return code.slice(5)
	}
	return code
}

export function formatShortcutLabel(entry: ShortcutEntry): string {
	if (entry.code === 'Slash' && entry.shift === true) {
		return '?'
	}
	const base = baseLabel(entry.code)
	const parts: string[] = []
	if (entry.meta === true) {
		parts.push('Cmd')
	}
	if (entry.shift === true) {
		parts.push('Shift')
	}
	parts.push(base)
	return parts.join('+')
}

export function groupShortcutsByCategory(
	registry: readonly ShortcutEntry[]
): ShortcutGroup[] {
	const groups: ShortcutGroup[] = []
	for (const entry of registry) {
		const category = entry.category ?? 'Other'
		const existing = groups.find((group) => group.category === category)
		if (existing === undefined) {
			groups.push({ category, entries: [entry] })
		} else {
			existing.entries.push(entry)
		}
	}
	return groups
}

export function resolveShortcut(
	event: ShortcutEvent,
	registry: readonly ShortcutEntry[],
	context: ShortcutContext
): ShortcutEntry | null {
	if (isTypingTarget(event.target)) {
		return null
	}
	return (
		registry.find(
			(entry) =>
				entry.code === event.code &&
				scopeMatches(entry, context) &&
				modifiersMatch(entry, event)
		) ?? null
	)
}
