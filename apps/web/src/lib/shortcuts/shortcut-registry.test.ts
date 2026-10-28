import { describe, expect, it } from 'vite-plus/test'
import {
	formatShortcutLabel,
	groupShortcutsByCategory,
	resolveShortcut,
	type ShortcutEntry
} from '@/lib/shortcuts/shortcut-registry'

describe('resolveShortcut', () => {
	const entry: ShortcutEntry = {
		code: 'Space',
		description: 'End turn',
		scope: 'always',
		handler: () => {}
	}

	it('returns the entry whose physical key matches event.code', () => {
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[entry],
			{ scope: 'inGame' }
		)
		expect(resolved).toBe(entry)
	})

	it('returns null when the event target is an input element', () => {
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: { tagName: 'INPUT', isContentEditable: false }
			},
			[entry],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	})

	it('returns null when the event target is a textarea', () => {
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: { tagName: 'TEXTAREA', isContentEditable: false }
			},
			[entry],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	})

	it('returns null when the event target is contenteditable', () => {
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: { tagName: 'DIV', isContentEditable: true }
			},
			[entry],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	})

	it('skips entries scoped to inGame when context is inMenu', () => {
		const inGameOnly: ShortcutEntry = {
			code: 'Space',
			description: 'End turn',
			scope: 'inGame',
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[inGameOnly],
			{ scope: 'inMenu' }
		)
		expect(resolved).toBeNull()
	})

	it('skips entries scoped to inMenu when context is inGame', () => {
		const inMenuOnly: ShortcutEntry = {
			code: 'Escape',
			description: 'Close',
			scope: 'inMenu',
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'Escape',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[inMenuOnly],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	})

	it('matches meta:true entry on Cmd (metaKey)', () => {
		const undo: ShortcutEntry = {
			code: 'KeyZ',
			description: 'Undo',
			scope: 'inGame',
			meta: true,
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'KeyZ',
				metaKey: true,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[undo],
			{ scope: 'inGame' }
		)
		expect(resolved).toBe(undo)
	})

	it('matches meta:true entry on Ctrl (ctrlKey)', () => {
		const undo: ShortcutEntry = {
			code: 'KeyZ',
			description: 'Undo',
			scope: 'inGame',
			meta: true,
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'KeyZ',
				metaKey: false,
				ctrlKey: true,
				shiftKey: false,
				target: null
			},
			[undo],
			{ scope: 'inGame' }
		)
		expect(resolved).toBe(undo)
	})

	it('does not match meta:true entry when no modifier is pressed', () => {
		const undo: ShortcutEntry = {
			code: 'KeyZ',
			description: 'Undo',
			scope: 'inGame',
			meta: true,
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'KeyZ',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[undo],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	})

	it('does not match a plain entry when Cmd/Ctrl is held', () => {
		const plain: ShortcutEntry = {
			code: 'Space',
			description: 'End turn',
			scope: 'inGame',
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: true,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[plain],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	})

	it('matches shift:true entry only when Shift is held', () => {
		const prev: ShortcutEntry = {
			code: 'Tab',
			description: 'Previous unit',
			scope: 'inGame',
			shift: true,
			handler: () => {}
		}
		const withShift = resolveShortcut(
			{
				code: 'Tab',
				metaKey: false,
				ctrlKey: false,
				shiftKey: true,
				target: null
			},
			[prev],
			{ scope: 'inGame' }
		)
		const withoutShift = resolveShortcut(
			{
				code: 'Tab',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[prev],
			{ scope: 'inGame' }
		)
		expect(withShift).toBe(prev)
		expect(withoutShift).toBeNull()
	})

	it('prefers the shift-variant over the plain-variant when Shift is held', () => {
		const plainTab: ShortcutEntry = {
			code: 'Tab',
			description: 'Next unit',
			scope: 'inGame',
			handler: () => {}
		}
		const shiftTab: ShortcutEntry = {
			code: 'Tab',
			description: 'Previous unit',
			scope: 'inGame',
			shift: true,
			handler: () => {}
		}
		const resolved = resolveShortcut(
			{
				code: 'Tab',
				metaKey: false,
				ctrlKey: false,
				shiftKey: true,
				target: null
			},
			[plainTab, shiftTab],
			{ scope: 'inGame' }
		)
		expect(resolved).toBe(shiftTab)
	})

	it('formats a letter-code entry using the bare letter', () => {
		expect(
			formatShortcutLabel({
				code: 'KeyE',
				description: 'End turn',
				scope: 'inGame',
				handler: () => {}
			})
		).toBe('E')
	})

	it('formats Slash+shift as "?"', () => {
		expect(
			formatShortcutLabel({
				code: 'Slash',
				description: 'Show help',
				scope: 'always',
				shift: true,
				handler: () => {}
			})
		).toBe('?')
	})

	it('formats Space as "Space"', () => {
		expect(
			formatShortcutLabel({
				code: 'Space',
				description: 'End turn',
				scope: 'inGame',
				handler: () => {}
			})
		).toBe('Space')
	})

	it('formats Escape as "Esc"', () => {
		expect(
			formatShortcutLabel({
				code: 'Escape',
				description: 'Close',
				scope: 'always',
				handler: () => {}
			})
		).toBe('Esc')
	})

	it('formats a digit code as the bare digit', () => {
		expect(
			formatShortcutLabel({
				code: 'Digit3',
				description: 'Action slot 3',
				scope: 'inGame',
				handler: () => {}
			})
		).toBe('3')
	})

	it('formats Tab+shift as "Shift+Tab"', () => {
		expect(
			formatShortcutLabel({
				code: 'Tab',
				description: 'Previous unit',
				scope: 'inGame',
				shift: true,
				handler: () => {}
			})
		).toBe('Shift+Tab')
	})

	it('formats KeyZ+meta as "Cmd+Z"', () => {
		expect(
			formatShortcutLabel({
				code: 'KeyZ',
				description: 'Undo',
				scope: 'inGame',
				meta: true,
				handler: () => {}
			})
		).toBe('Cmd+Z')
	})

	it('groups shortcuts by their category, preserving order', () => {
		const endTurn: ShortcutEntry = {
			code: 'Space',
			description: 'End turn',
			scope: 'inGame',
			category: 'Actions',
			handler: () => {}
		}
		const fullscreen: ShortcutEntry = {
			code: 'KeyF',
			description: 'Toggle fullscreen',
			scope: 'always',
			category: 'System',
			handler: () => {}
		}
		const help: ShortcutEntry = {
			code: 'Slash',
			description: 'Show help',
			scope: 'always',
			shift: true,
			category: 'System',
			handler: () => {}
		}
		expect(groupShortcutsByCategory([endTurn, fullscreen, help])).toEqual([
			{ category: 'Actions', entries: [endTurn] },
			{ category: 'System', entries: [fullscreen, help] }
		])
	})

	it('matches "always"-scoped entries regardless of context', () => {
		const always: ShortcutEntry = {
			code: 'Slash',
			description: 'Help',
			scope: 'always',
			handler: () => {}
		}
		const inGame = resolveShortcut(
			{
				code: 'Slash',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[always],
			{ scope: 'inGame' }
		)
		const inMenu = resolveShortcut(
			{
				code: 'Slash',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: null
			},
			[always],
			{ scope: 'inMenu' }
		)
		expect(inGame).toBe(always)
		expect(inMenu).toBe(always)
	})
})

it.each(['BUTTON', 'A', 'SELECT'])(
	'leaves %s keyboard activation to the focused control',
	(tagName) => {
		const handler = vi.fn<() => void>()
		const resolved = resolveShortcut(
			{
				code: 'Space',
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				target: { tagName, isContentEditable: false }
			},
			[{ code: 'Space', description: 'End turn', scope: 'inGame', handler }],
			{ scope: 'inGame' }
		)
		expect(resolved).toBeNull()
	}
)
