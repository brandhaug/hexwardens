import { type ReactNode } from 'react'

export type AssetRig = 'Rig_Medium' | 'Rig_Large'

/**
 * KayKit character rigs expose two empty bones — `handslot.r` and `handslot.l` —
 * shaped so a weapon GLB attached as a child at the bone's origin reads as
 * properly gripped. Equipment slots map directly to those bones. Three.js's
 * GLTFLoader strips the dot from bone names (a reserved animation-path
 * separator), so the runtime lookup uses `handslotr` / `handslotl`.
 */
export type EquipmentSlot = 'rightHand' | 'leftHand'

export interface EquipmentAttachment {
	readonly path: string
}

export type EquipmentLoadout = Partial<
	Record<EquipmentSlot, EquipmentAttachment>
>

export interface MeshAssetEntry {
	readonly kind: 'mesh'
	readonly path: string
	readonly source?: 'kaykit' | 'poly-pizza' | 'other'
	readonly tintMaterial?: string
	readonly attribution?: string
	readonly scale?: number
	readonly rig?: AssetRig
	readonly equipment?: EquipmentLoadout
}

export interface ProceduralEntry<TContext> {
	readonly kind: 'procedural'
	readonly render: (ctx: TContext) => ReactNode
}

export type VisualRegistryEntry<TContext> =
	| MeshAssetEntry
	| ProceduralEntry<TContext>

/**
 * Common shape every `resolve*Visual()` helper returns. Standardizes the
 * two scale axes so consumers can render any Tile-anchored visual with the
 * same wrapper / mesh-scale pattern, regardless of the underlying domain:
 *
 *   <group scale={[groupScale, groupScale, groupScale]}>
 *     <MeshAsset path={entry.path} scale={meshScale} />
 *   </group>
 *
 * `groupScale` is the outer wrapper transform (1 means "no wrapper");
 * `meshScale` is forwarded to `MeshAsset.scale` and may be `undefined` to
 * use the asset's native scale. Each resolver picks how to derive the two
 * (Village uses level, Resource hard-codes a per-category constant, etc.),
 * but the output shape is uniform.
 */
export interface VisualRender<TEntry = MeshAssetEntry> {
	readonly entry: TEntry
	readonly groupScale: number
	readonly meshScale: number | undefined
}
