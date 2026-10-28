import { tileHighlightColor } from './tile-highlight-color'

describe('tileHighlightColor', () => {
	it('returns null when no flag is set', () => {
		expect(
			tileHighlightColor({
				isSelected: false,
				isAttackable: false,
				isMoveable: false,
				isHovered: false
			})
		).toBeNull()
	})

	it('selected wins over everything', () => {
		const result = tileHighlightColor({
			isSelected: true,
			isAttackable: true,
			isMoveable: true,
			isHovered: true
		})
		expect(result).toBeTruthy()
		expect(result).not.toBe(
			tileHighlightColor({
				isSelected: false,
				isAttackable: true,
				isMoveable: false,
				isHovered: false
			})
		)
	})

	it('attackable wins over moveable and hover', () => {
		const result = tileHighlightColor({
			isSelected: false,
			isAttackable: true,
			isMoveable: true,
			isHovered: true
		})
		expect(result).toBe(
			tileHighlightColor({
				isSelected: false,
				isAttackable: true,
				isMoveable: false,
				isHovered: false
			})
		)
	})

	it('moveable wins over hover', () => {
		const result = tileHighlightColor({
			isSelected: false,
			isAttackable: false,
			isMoveable: true,
			isHovered: true
		})
		expect(result).toBe(
			tileHighlightColor({
				isSelected: false,
				isAttackable: false,
				isMoveable: true,
				isHovered: false
			})
		)
	})

	it('returns a hover-only color when only hover is set', () => {
		const hoverColor = tileHighlightColor({
			isSelected: false,
			isAttackable: false,
			isMoveable: false,
			isHovered: true
		})
		expect(hoverColor).toBeTruthy()
		expect(hoverColor).not.toBe(
			tileHighlightColor({
				isSelected: true,
				isAttackable: false,
				isMoveable: false,
				isHovered: false
			})
		)
		expect(hoverColor).not.toBe(
			tileHighlightColor({
				isSelected: false,
				isAttackable: true,
				isMoveable: false,
				isHovered: false
			})
		)
		expect(hoverColor).not.toBe(
			tileHighlightColor({
				isSelected: false,
				isAttackable: false,
				isMoveable: true,
				isHovered: false
			})
		)
	})
})
