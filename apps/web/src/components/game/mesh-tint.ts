import {
	Color,
	type Material,
	Mesh,
	MeshStandardMaterial,
	MeshLambertMaterial,
	MeshPhongMaterial,
	MeshBasicMaterial,
	MeshToonMaterial,
	type Object3D
} from 'three'

export function applyTint(
	root: Object3D,
	hex: string,
	targetName: string | undefined
) {
	const color = new Color(hex)
	const clones = new Map<Material, Material>()
	function tint(material: Material): Material {
		const existing = clones.get(material)
		if (existing) {
			return existing
		}
		const tinted = retintOne(material, color, targetName)
		if (tinted !== material) {
			clones.set(material, tinted)
		}
		return tinted
	}
	root.traverse((obj) => {
		if (!isMesh(obj)) {
			return
		}
		obj.material = Array.isArray(obj.material)
			? obj.material.map(tint)
			: tint(obj.material)
	})
	return [...clones.values()]
}

function retintOne(
	material: Material,
	color: Color,
	targetName: string | undefined
): Material {
	if (!isTintableMaterial(material)) {
		return material
	}
	if (targetName !== undefined && material.name !== targetName) {
		return material
	}
	const cloned = material.clone()
	if (targetName !== undefined) {
		cloned.color = color.clone()
		return cloned
	}
	cloned.color = hueShiftTowardTint(material.color, color)
	return cloned
}

/**
 * Blend the original material colour with a tribe tint. The strategy depends
 * on the original's saturation:
 *
 * - **High-saturation (>0.55)** materials are treated as "team marker" slots
 *   (roof tiles, flag cloth, cape) and are replaced wholesale with the tint —
 *   so a red KayKit roof flips to green for druids, blue for rogues, etc.
 * - **Low-saturation** materials (wood, stone, skin, leather) keep their own
 *   lightness and only adopt the tint's hue at reduced saturation, preserving
 *   inter-mesh detail instead of flattening the whole asset to one colour.
 */
function hueShiftTowardTint(original: Color, tint: Color): Color {
	const origHsl = { h: 0, s: 0, l: 0 }
	const tintHsl = { h: 0, s: 0, l: 0 }
	original.getHSL(origHsl)
	tint.getHSL(tintHsl)
	if (origHsl.s > 0.55) {
		return new Color().setHSL(tintHsl.h, tintHsl.s, tintHsl.l)
	}
	const saturation = origHsl.s < 0.08 ? tintHsl.s * 0.5 : tintHsl.s * 0.7
	return new Color().setHSL(tintHsl.h, saturation, origHsl.l)
}

function isMesh(obj: Object3D): obj is Mesh {
	return obj instanceof Mesh
}

type TintableMaterial =
	| MeshStandardMaterial
	| MeshLambertMaterial
	| MeshPhongMaterial
	| MeshBasicMaterial
	| MeshToonMaterial

function isTintableMaterial(material: Material): material is TintableMaterial {
	return (
		material instanceof MeshStandardMaterial ||
		material instanceof MeshLambertMaterial ||
		material instanceof MeshPhongMaterial ||
		material instanceof MeshBasicMaterial ||
		material instanceof MeshToonMaterial
	)
}
