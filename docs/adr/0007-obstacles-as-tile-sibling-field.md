# Model Obstacles as a Tile sibling field, not a Tile Item

Hexwardens is adding **Obstacles** — passive, movement-blocking terrain features such as boulders, tree clusters, dead trees, bushes, and conifers — to land terrain tiles. Obstacles are not owned, do not change Tribe, and cannot be cleared. They hard-block ground movement and are bypassed by flying Units; this matches the existing pattern where `water` blocks non-flying Units.

We model an Obstacle as a sibling field on `TileState` (`obstacle: ObstacleKind | null`) rather than extending the `TileItem` union to a fifth variant. The `TileItem` set (Village, Building, Ruins, Resource) is reserved for _interactive_ tile occupants that participate in Capture, Collection, or Exploration. Obstacles are passive — they have no `tileAction` surface and never change ownership — so packing them into `TileItem` would dilute the term and force every Tile Item consumer (capture, fog reveal, collect, build adjacency) to special-case "not really a Tile Item." A Tile may now carry one Obstacle alongside one Tile Item, which is impossible if Obstacles share the single `item` slot.

Mountain remains modelled separately through `terrain === 'mountain'` (with its own tech gate `canEnterMountain` and movement cost 2). We accept the short-term duplication: mountains pre-date Obstacles, have unique semantics (tech-unlockable, cost-2 traversal), and rolling them into the new `obstacle` field would balloon the scope of this change. A later pass may generalize both into a single `terrainFeature` field.

Obstacles spawn during `generateBoard` with a single 10% chance on the ten eligible land terrains (grass, forest, jungle, swamp, desert, barren, terraced, tundra, snow, ice), seeded from `state.seed` via `Prando` to preserve determinism. Generation skips tiles within distance ≤ 2 of any starting Village to protect openings, skips tiles that already carry a `TileItem`, and skips mountain tiles. Each terrain maps to a single fixed `ObstacleKind` for now; per-tile mesh-variant rotation is a render-side concern keyed off `(seed, q, r)`.

Obstacles are **hidden** under Fog of War — projected only on explored tiles, like Tile Items, not visible-through-fog like Terrain. A future reader may expect them to behave like mountains (visible through fog); the deliberate choice is item-like, so scouting still matters around forests and swamps.

## Considered and rejected

- **Fifth `TileItem` kind.** Forces capture/collect/explore machinery to no-op for the new kind and contradicts the `TileItem` definition in `CONTEXT.md`.
- **Generalize `isMountain` to `terrainFeature`.** Larger refactor than this change warrants; defer until a second non-mountain terrain feature lands.
- **Cost-2 soft gate instead of hard block.** Contradicts the word "Obstacle"; the soft-gate semantic already exists for mountains.
- **Tech-gated traversal (like mountain).** Adds a Tech node and an ADR-sized Tech tree change; not needed for v1.
- **Visible through fog.** Matches the mountain precedent but undermines the surprise of forest/swamp scouting.
