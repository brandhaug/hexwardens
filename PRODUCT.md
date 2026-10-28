# Product

## Register

brand

## Users

Casual and mixed-audience strategy gamers looking for a cozy, approachable hex-grid
experience — closer to a board game night than a competitive esport. Players range
from quick-session mobile users to desktop strategy fans who enjoy tribe management,
tech trees, and tactical combat. They arrive at the landing, lobby, and wiki to
decide whether this world is worth their evening; the interface has to earn that
decision before play even starts. It should welcome newcomers while rewarding depth
for returning players.

## Product Purpose

Hexwardens is a turn-based hex-strategy web game where players command tribes, grow
villages, research tech, and fight for control of a procedurally generated board.
One playable session is a **Match** (never a game, room, or session — see
[CONTEXT.md](./CONTEXT.md)). It ships single-player offline play (the `/game` route),
private lobbies and public-queue matchmaking, and authoritative online multiplayer.

Success is a player who feels invited in — who reads the landing and lobby as one
warm, coherent world, settles into a Match, and comes back. The product wins when
the brand experience around the board feels as crafted as the board itself: no
seam between "marketing surface" and "the actual game."

## Brand Personality

**Strategic, ancient, warm, sunlit.** Three words: _cozy, tactile, mythic._

The game evokes commanding tribes across a mythic, ancient world, wrapped in the
comfort of a tabletop game night. The voice is thoughtful, not aggressive; inviting,
not urgent. Warmth comes from sunlit low-poly terrain, parchment text, match gold,
weathered teal command chrome, carved-serif typography (Cinzel headings, Crimson Pro
body), and miniature art that favors charm over realism.

**Emotional goals:** Cozy, inviting, and inspectable. Players should feel like they
are settling in to move toy-like pieces across a vivid strategy board, not grinding
through a monetized mobile surface.

## Anti-references

- Generic mobile games with flashy monetization, cluttered HUDs, and attention-grabbing
  UI patterns.
- Gacha-style visual noise, overwrought particle bursts, celebratory confetti, and neon.
- Stark dark-wood / aged-mahogany "fantasy game" chrome — the brand is sunlit weathered
  teal, not candlelit tavern.
- System-font fallbacks swapped in "for readability." Cinzel and Crimson Pro are
  load-bearing brand identity.

Chunky game chrome is allowed — even encouraged — when it clarifies play. The line is
between functional weight and decorative noise.

## Design Principles

1. **Board first, chrome second.** The hex grid is the star. UI supports the game and
   never competes with it. Give the board the majority of viewport pixels; controls are
   icon-first and immediately legible.

2. **Bright, not loud.** Prefer saturated terrain and toy-like miniatures, but keep the
   palette natural — grass, sand, ice, water, parchment, teal, gold. Sunlit and tactile,
   never neon.

3. **One world, every route.** Landing, lobby, wiki, profile, and match share a single
   palette and type system. A player should never feel they crossed into a different app.
   The brand carries the board; the board doesn't get a separate skin.

4. **Charm through craft.** Personality comes from well-chosen sprites, carved-serif
   typography, and thoughtful color — not ornamental flourishes. The low-poly,
   sprite-based art style is a deliberate choice; lean into it. Polytopia's restraint is
   the benchmark.

5. **Approachable depth.** Surface simple controls for common actions; reveal complexity
   progressively. A new player understands the board in seconds; a returning player finds
   strategic depth without UI friction.

## Accessibility & Inclusion

- **WCAG 2.2 AA.** Body text ≥4.5:1, large text ≥3:1, against its actual background
  (teal chrome, not an assumed white). Visible focus on every interactive element; the
  gold `ring` token is the focus signal.
- **Touch + keyboard.** Full keyboard navigation for chrome and match controls, and
  touch targets ≥44px so the board is playable one-handed on mobile. The bottom action
  dock and End Turn FAB are the canonical touch-sized controls.
- Tribe identity and hex-state cues should pair color with shape, label, or position
  where play depends on them, so the board stays legible under color-vision differences
  even though it isn't a formal commitment.

---

Visual tokens — colors, typography, spacing, shapes, component contracts — live in
[DESIGN.md](./DESIGN.md). This file owns the _why_ (audience, purpose, personality,
principles); DESIGN.md owns the _what_ (exact values). Don't duplicate tokens here.
