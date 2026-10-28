# Hexwardens Domain Context

Hexwardens is a turn-based hex-strategy game where players command tribes on a shared hex board. This context captures the product and gameplay language used by designers, developers, and future agents when discussing rules, state, and player-facing concepts.

## Language

**Match**:
A single game session played on one generated board until a winning or terminal outcome is reached.
_Avoid_: Game, room, session

**Saved Match**:
An unfinished single-player Match preserved so the Player can continue it later.
_Avoid_: Save slot, saved game, checkpoint

**Saved Match Revision**:
The ordered snapshot of a Saved Match used to decide which copy is most recent when local and remote copies reconnect.
_Avoid_: Save version, sync counter, timestamp

**Lobby**:
A pre-match waiting space where players choose slots, invite others, and configure the future match.
_Avoid_: Room, queue

**Public Queue**:
A matchmaking waiting pool for players who want the system to find opponents automatically. A Public Queue produces a Match once enough Players are found; unlike a private Lobby, it is not joined through an invite code and does not expose host configuration.
_Avoid_: Public lobby, quick room

**Player**:
A human, guest, or bot participant that controls exactly one tribe in a match.
_Avoid_: User, account, client

**Tribe**:
A player-controlled faction with its own identity, starting terrain alignment, villages, units, resources, and technologies.
_Avoid_: Faction, team, civilization

**Board**:
The hexagonal play surface made of terrain tiles, villages, resources, buildings, ruins, and units.
_Avoid_: Map, grid

**Tile**:
One hex on the board, identified by its board position and containing terrain plus optional item and unit occupancy.
_Avoid_: Cell, square, space

**Tile Item**:
The non-Unit occupant of a Tile — one of Building, Village, Resource, or Ruins. A Tile may hold zero or one Tile Item alongside its Unit (if any).
_Avoid_: Tile occupant, tile object, prop

**Village**:
A tribe-owned settlement on a tile that defines local influence, supports growth, and anchors many build and training actions. Each Village has a level (1–N) that grows with collected experience; on level-up the owning Player picks one Village Perk. Village level, Perks, and Capital flag survive capture.
_Avoid_: City, base, settlement

**Capital**:
A special kind of Village that grants the owning Tribe a +1 maximum population bonus. Each Tribe begins the Match with exactly one Capital — its starting Village. The Capital flag survives capture, but a Tribe whose Capital is taken does not gain a new Capital from any other Village.
_Avoid_: Hometown, main city, home base

**Capture**:
The two-step Action by which a Tribe takes ownership of an enemy or neutral Village. The capturing Unit issues a `capture` Action that locks it on the Village tile until the start of its Tribe's next Turn, at which point ownership flips if the Unit is still present. Killing or moving the Unit during the setup window cancels the Capture.
_Avoid_: Conquer, claim, take

**Building**:
A Tribe-owned structure on a Tile that augments the owning Tribe's economy, tech, or mobility. Buildings are captured along with their containing Tile, and a Building's Tribe is `null` until it is built or captured. There are three kinds — Primary, Secondary, and Utility.
_Avoid_: Improvement, structure, facility

**Primary Building**:
The tier-1 Building anchored to one of the five elemental Tech Paths (Water, Plants, Earth, Fire, Mineral). Each Primary Building can only be constructed on its Path's terrain bundle — e.g. a mine builds on stone, terraced, or ice tiles.
_Avoid_: Tier-1 building, base economy building

**Secondary Building**:
The tier-2 Building of a Tech Path, built adjacent to its matching Primary Building. Each Secondary Building has a "Large" variant that is unlocked when the Path's Mastery is researched.
_Avoid_: Tier-2 building, upgraded building

**Utility Building**:
A Mobility-branch Building (Roads, Seaport, Guild) that augments traversal or training rather than income. Each Utility Building is gated by a specific Mobility Tech.
_Avoid_: Infrastructure, support building

**Resource**:
A neutral, tile-anchored item — apple, wheat, gem, fish, etc. — that a Tribe collects through a Tile Action for a one-time benefit. Resources are not owned and do not change Tribe; they vanish on collection. Resource types align thematically with terrain (apple on grass, gem on stone, fish on tundra). Distinct from a player currency (population, gold, science) — those are not Resources in Hexwardens' vocabulary.
_Avoid_: Loot, drop, currency, deposit

**Ruins**:
A neutral, single-use Tile structure of unknown origin. Exploring Ruins through a Tile Action yields one of three rewards — gold, experience for a Unit, or a free Unit — chosen at the Ruins' creation time and revealed on exploration. Ruins are not owned and do not change Tribe.
_Avoid_: Treasure, dungeon, relic

**Obstacle**:
A passive, movement-blocking terrain feature on a Tile — boulder, tree cluster, dead tree, etc. An Obstacle hard-blocks ground movement into the Tile; flying Units traverse it normally. Obstacles are not owned, do not change Tribe, and cannot be cleared. They are a sibling property of Terrain (like the stone-blocked flag), not a Tile Item, so an Obstacle may coexist with a Tile Item on the same Tile when board generation permits.
_Avoid_: Barrier, blockage, hazard, prop

**Unit**:
A movable tribe piece on the board with a type, health, mode, and combat state.
_Avoid_: Troop, piece, character

**Tech**:
A researched capability that unlocks actions, units, passives, or terrain interactions for a tribe. Tech research cost increases with each Village a Tribe owns.
_Avoid_: Upgrade, skill, research

**Tech Path**:
A themed cluster of related Techs ending in a Mastery. There are six Tech Paths: Mobility (utility, four linear nodes) and the five elemental paths Water, Plants, Earth, Fire, and Mineral, each shaped as one basic Tech, two secondary branches (economic + military), and a Mastery tip.
_Avoid_: Tech tree branch, tech line

**Mastery**:
The terminal Tech of a Tech Path. Researching a Mastery takes a full Turn during which no other Tech can be researched. Each Mastery grants a passive buff and unlocks "Large" upgrades to the Path's economic-tier-2 building.
_Avoid_: Mastery tech, super tech, ultimate research

**Fog of War**:
The per-player visibility boundary that determines which board information that player is allowed to see.
_Avoid_: Fog, visibility filter

**Action**:
A player intent that changes match state through moving, attacking, or performing a tile action. Each Action is committed irrevocably when issued — there is no in-Turn undo.
_Avoid_: Command, move

**Turn**:
The period in which one tribe is allowed to act before turn advancement applies upkeep, effects, and the next acting tribe.
_Avoid_: Round, phase

**Bot**:
A non-human player that chooses actions through game-logic decision scoring.
_Avoid_: AI, NPC, computer

**Hero**:
A tribe-flagship Unit that cannot be recruited with gold. A Player may summon their Tribe's Hero by choosing the `special_unit` Village Perk during a Village's level-up to level 5; the perk consumes that level-up's choice. If the Player chooses any other Perk at the level-5 transition, that Village will never spawn a Hero — `special_unit` is only offered at the level-5 transition. Captured Villages keep the Perk choices made by their previous owner; the captor cannot retroactively summon a Hero from a captured level-5+ Village. Each Tribe has exactly one Hero type, and Heroes have fixed stats (no in-play levelling).
_Avoid_: Guardian, champion, ultimate, super unit

**Daily Challenge**:
A time-boxed objective (e.g. "capture 5 villages") shared by every Player for one UTC day. The Daily Challenge is evaluated only inside **Public Queue** Matches — a Player makes progress passively whenever they play Public Queue. Completion is recorded when the objective triggers during a Match the Player did not forfeit; the Match's win/loss outcome does not affect completion. Each Player's best result for the day (fewest Turns to complete) feeds the day's leaderboard. Daily Challenges are first-class and distinct from **Achievements** — Achievements are permanent per-account unlocks, while a Daily Challenge resets every UTC midnight.
_Avoid_: Quest, daily quest, daily mission, objective

## Relationships

- A **Lobby** produces zero or one **Match**.
- A **Public Queue** produces zero or one **Match** when enough **Players** are found.
- A **Player** has at most one active **Saved Match**.
- A **Saved Match** refers to exactly one unfinished single-player **Match**.
- A **Saved Match** stores the full authoritative state of a single-player **Match** and is not a multiplayer Fog of War projection.
- A **Saved Match** has exactly one current **Saved Match Revision** per storage location.
- A **Saved Match** carries enough summary details for the Player to identify it before the full Match snapshot is loaded.
- A **Saved Match** may exist in local and remote storage, but the Player-facing **Saved Match** and **Saved Match Revision** rules are the same across platforms.
- A **Saved Match Revision** is only continuable when its stored snapshot is compatible with the current Match rules.
- A guest **Player**'s local **Saved Match** becomes that logged-in **Player**'s **Saved Match** when they sign in, subject to the same recency and divergence rules as cross-device sync.
- Local **Saved Match** storage is the durability source for offline play; remote storage is best-effort replication for logged-in Players.
- Remote **Saved Match** storage exists only for logged-in **Players**; guest **Players** keep local-only Saved Matches.
- When local and remote **Saved Match Revisions** both advance independently, the Player chooses which revision remains active.
- A **Saved Match Revision** can replace another only when it is based on the current known revision or the Player explicitly chooses it during divergence resolution.
- Starting a new single-player **Match** replaces the active **Saved Match** only after the **Player** explicitly chooses not to continue it.
- Continuing a **Saved Match** resumes its stored setup and state; current single-player setup choices only apply when starting a new **Match**.
- A completed **Saved Match** remains resumable only until the Player acknowledges the final outcome, after which it no longer occupies the active Saved Match slot.
- Acknowledging a completed **Saved Match** records that the active Saved Match is deleted, so later sync must not resurrect an older unfinished copy.
- A **Match** has one **Board** and two or more **Players**.
- A **Player** controls exactly one **Tribe** in a **Match**.
- A **Tribe** owns zero or more **Villages** and controls zero or more **Units**.
- A **Village** occupies exactly one **Tile**.
- A **Unit** occupies at most one **Tile** at a time.
- A **Tile** can contain at most one **Unit**.
- A **Tile Item** is one of: **Building**, **Village**, **Resource**, or **Ruins**.
- A **Building** occupies exactly one **Tile** and is owned by zero or one **Tribe**.
- A **Resource** occupies exactly one **Tile** and is not owned by any **Tribe**.
- **Ruins** occupy exactly one **Tile** and are not owned by any **Tribe**.
- An **Obstacle** occupies exactly one **Tile** and is not owned by any **Tribe**.
- A **Tile** has at most one **Obstacle**, which coexists with at most one **Tile Item**.
- A **Tech** belongs to a **Tribe** through that tribe's player state.
- An **Action** is issued by a **Player** for their **Tribe** during that tribe's **Turn**.
- An **Action** issued by a **Player** cannot be undone within the same **Turn**.
- **Fog of War** is projected separately for each **Player** from the authoritative match state.
- A **Bot** is a **Player**, not a separate match role.
- A **Daily Challenge** is associated with exactly one UTC day; the active one is the same for every **Player** worldwide.
- A **Daily Challenge**'s objective is evaluated only inside a **Public Queue** **Match**, independently per **Player** in that **Match**.
- A **Player** may complete a given UTC day's **Daily Challenge** at most once; subsequent **Public Queue** **Matches** that day can only improve the recorded turn-count.

## Example dialogue

> **Dev:** "When a **Player** joins the **Lobby**, do we assign their **Tribe** immediately?"
> **Domain expert:** "Yes. The **Lobby** owns slot and tribe selection before the **Match** starts. Once the **Match** exists, that **Player** controls that **Tribe** until the match ends."

> **Dev:** "Can the client inspect the full **Board** and hide tiles locally with **Fog of War**?"
> **Domain expert:** "No. **Fog of War** is a server-side boundary for online matches; each **Player** receives only their projected board view."

> **Dev:** "If a **Player** opens `/game` with different setup choices, do we reshape their **Saved Match**?"
> **Domain expert:** "No. Continuing a **Saved Match** resumes the stored **Match**. The new setup choices only apply if the **Player** starts a new **Match**."

## Flagged ambiguities

- "Game" is overloaded between the product name, a match route, and an individual **Match**. Use **Match** for one playable session.
- "Move" can mean a unit movement or any player decision. Use **Action** for the general player intent and movement only for unit relocation.
- "AI" is too broad for non-human participants. Use **Bot** for a player controlled by game-logic decision scoring.
- "Resource" was historically overloaded in strategy games to mean both tile-anchored items (apple, gem) and player-side currencies (gold, science). In Hexwardens, **Resource** refers only to the tile-anchored item; player-side currencies are referred to by their specific names (gold, science, population).
- "Structure" is overloaded between Buildings and Villages. Prefer the specific term — **Building**, **Village** — and avoid "structure" except when intentionally generalizing across both.
