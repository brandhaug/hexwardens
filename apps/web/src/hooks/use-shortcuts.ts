import { useEffect } from 'react'
import {
	resolveShortcut,
	type ShortcutContext,
	type ShortcutEntry,
	type ShortcutTarget
} from '@/lib/shortcuts/shortcut-registry'

function targetFromEvent(target: EventTarget | null): ShortcutTarget | null {
	if (!(target instanceof Element)) {
		return null
	}
	return {
		tagName:
			target.closest('button, a, input, textarea, select, [role=button]')
				?.tagName ?? target.tagName,
		isContentEditable: target instanceof HTMLElement && target.isContentEditable
	}
}

export function useShortcuts(
	registry: readonly ShortcutEntry[],
	context: ShortcutContext
): void {
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.repeat || event.defaultPrevented) {
				return
			}
			if (
				context.scope === 'inGame' &&
				document.querySelector(
					'dialog[open], [role="dialog"][data-state="open"]'
				)
			) {
				return
			}
			const entry = resolveShortcut(
				{
					code: event.code,
					metaKey: event.metaKey,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
					target: targetFromEvent(event.target)
				},
				registry,
				context
			)
			if (entry === null) {
				return
			}
			event.preventDefault()
			entry.handler()
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [registry, context])
}
