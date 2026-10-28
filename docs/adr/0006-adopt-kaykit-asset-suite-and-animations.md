# Adopt KayKit Asset Suite and Animations

Hexwardens is replacing the Poly Pizza visual catalogue with the locally owned KayKit suite under `~/kaykit/`. KayKit is CC0 / public domain, broad enough to cover characters, buildings, resources, terrain, and decorations, and has a coherent low-poly medieval style that better matches the tabletop strategy direction in `DESIGN.md`.

This supersedes ADR-0005's incremental Poly Pizza curation model. The target state is a single KayKit-only asset set committed under `apps/web/public/models/`, with no Poly Pizza GLBs retained as fallbacks. Runtime model loading stays local and reproducible: the Worker and web app never fetch from third-party asset CDNs.

KayKit `.gltf` + `.bin` pairs are converted to single-file `.glb` assets with `gltf-pipeline`. Existing KayKit `.glb` character files are copied into place. The conversion workflow is intentionally explicit per asset rather than wildcard-driven, so each registry entry can be reviewed against its source mesh. `tools/convert-kaykit-asset.ts` is the repo-local wrapper for this first conversion step. Character animations are bundled as local KayKit animation-library GLBs under `apps/web/public/models/animations/`; runtime loading stays local and does not depend on third-party CDNs.

The visual registry now models rig compatibility directly. `MeshAssetEntry.rig` is optional: `Rig_Medium` and `Rig_Large` entries participate in the animation system, while entries without a rig are static meshes such as cannons, resources, buildings, terrain, and decorations. `apps/web/src/components/game/animation-clips.ts` records the canonical clip names verified from KayKit's animation containers:

- `Rig_Medium`: `Idle_A`, `Walking_A`, `Melee_1H_Attack_Slice_Horizontal`, `Death_B`
- `Rig_Large`: `Idle_A`, `Walking_A`, `Melee_2H_Attack`, `Death_A`

The board renderer uses KayKit hex terrain meshes with decorations composed at runtime per terrain. Procedural fog cylinders, highlight discs/rings, ownership rings, and position interpolation remain visual infrastructure owned by the app. Gameplay determinism is unchanged: animations are display-only and never gate `dispatch()`, combat resolution, fog projection, or turn advancement.

KayKit does not match every legacy theme name, so some game-logic strings are being renamed to KayKit-aligned archetypes. These renames intentionally change wire/save format strings for tribes, resources, and buildings; active matches should be treated as reset-on-deploy when the full rename lands. Hero ability identifiers are kept for now even when their themes are temporarily mismatched, and should be renamed in a later tribe-agnostic ability pass.

Triangle-count caps are relaxed to fit actual KayKit meshes while preserving board performance:

- Heroes: <= 15,000 tris
- Units: <= 10,000 tris
- Buildings and villages: <= 7,500 tris
- Resources: <= 1,500 tris
- Tile meshes: <= 100 tris
- Decoration props: <= 1,500 tris

`tools/check-tri-counts.ts` reports maximum triangle counts per committed model category and exits non-zero if a category exceeds its cap. The PR description for the full overhaul should include that report, before/after screenshots, the game-logic rename log, and the wire-format reset disclaimer.
