---
version: alpha
name: Hexwardens
description: Sunlit low-poly hex strategy with warm tabletop roots, chunky terrain, and teal/gold command chrome.
colors:
  background: '#0F3E4D'
  foreground: '#F7FBEF'
  card: '#0A738B'
  card-foreground: '#F7FBEF'
  popover: '#0B6F86'
  popover-foreground: '#F7FBEF'
  primary: '#F7B943'
  primary-foreground: '#4B2A0B'
  secondary: '#315A60'
  secondary-foreground: '#F7FBEF'
  muted: '#1C5364'
  muted-foreground: '#D5EEF1'
  accent: '#087D97'
  accent-foreground: '#F7FBEF'
  destructive: '#E0574A'
  success: '#5FB77A'
  border: '#05536B'
  input: '#0B6F86'
  ring: '#FFD05A'
  hex-selected: '#FFD05A'
  hex-attackable: '#E0574A'
  hex-moveable: '#FFE38A'
  hex-perimeter: '#5FB77A'
  tribe-barbarians: '#DC2626'
  tribe-rogues: '#2563EB'
  tribe-druids: '#4D9F5B'
  tribe-orcs: '#7F1D1D'
  tribe-wraiths: '#9333EA'
  tribe-engineers: '#CA8A04'
  tribe-rangers: '#059669'
  tribe-skeletons: '#C7B99A'
  tribe-frostkin: '#06B6D4'
typography:
  display:
    fontFamily: Cinzel Variable
    fontSize: 3.5rem
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: 0.01em
  h1:
    fontFamily: Cinzel Variable
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0.01em
  h2:
    fontFamily: Cinzel Variable
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 1.15
  h3:
    fontFamily: Cinzel Variable
    fontSize: 1.375rem
    fontWeight: 600
    lineHeight: 1.2
  body-lg:
    fontFamily: Crimson Pro Variable
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Crimson Pro Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Crimson Pro Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Cinzel Variable
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.12em
  numeric-hud:
    fontFamily: Cinzel Variable
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1
    fontFeature: "'tnum'"
rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 8px
  interactive: 6px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 72px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.label-caps}'
    rounded: '{rounded.interactive}'
    padding: 12px
    height: 40px
  button-primary-hover:
    backgroundColor: '#FFD05A'
    textColor: '{colors.primary-foreground}'
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.label-caps}'
    rounded: '{rounded.interactive}'
    padding: 12px
    height: 40px
  button-ghost:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.label-caps}'
    rounded: '{rounded.interactive}'
    padding: 12px
  button-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.foreground}'
    typography: '{typography.label-caps}'
    rounded: '{rounded.interactive}'
    padding: 12px
    height: 40px
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.lg}'
    padding: 16px
  input:
    backgroundColor: '{colors.input}'
    textColor: '{colors.foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.interactive}'
    height: 40px
    padding: 12px
  hex-tile-selected:
    backgroundColor: '{colors.hex-selected}'
    textColor: '{colors.primary-foreground}'
  hex-tile-attackable:
    backgroundColor: '{colors.hex-attackable}'
    textColor: '{colors.foreground}'
  hex-tile-moveable:
    backgroundColor: '{colors.hex-moveable}'
    textColor: '{colors.primary-foreground}'
  tribe-badge:
    typography: '{typography.label-caps}'
    rounded: '{rounded.interactive}'
    padding: 6px
    height: 24px
---

## Overview

Hexwardens is a turn-based hex-strategy game that feels like a bright tabletop diorama, not an esport. The interface evokes commanding tribes across a mythic, ancient world — but wrapped in approachable low-poly charm. It is strategic, ancient, warm, and sunlit.

**Emotional goals.** Cozy, inviting, and inspectable. Players should feel like they are moving toy-like pieces across a vivid strategy board, not grinding through a monetized mobile surface.

**Primary reference.** Polytopia plus Hexwardens-style mobile screenshots — low-poly charm, clean UI hierarchy, chunky raised hexes, bright water, pale fog caps, oversized miniatures, and large readable command buttons. The UI stays out of the way while the hex board takes center stage.

**Anti-references.** Generic mobile games with flashy monetization, cluttered HUDs, gacha-style visual noise, aggressive attention hooks, or neon. Chunky game chrome is allowed when it improves command clarity.

**Theme.** Weathered teal chrome, parchment text, and match gold accents are the brand — across landing, lobby, wiki, profile, and match routes. There is one palette, applied consistently, so a player never feels they crossed into a different app. The board canvas stays bright low-poly underneath the teal chrome.

## Colors

The palette is rooted in weathered teal chrome, match gold accents, and parchment text — a single coherent system that runs across every route, not just the match HUD. Authoritative values are stored in OKLch in `apps/web/src/index.css` for perceptual uniformity; the sRGB hex tokens in this file are the portable equivalent for agents and exports.

- **Background (`#0F3E4D`):** Deep weathered teal for the global page surface, behind chrome and the board canvas.
- **Card / Popover (`#0A738B` / `#0B6F86`):** Lifted teal panel for dialogs, HUD chips, the lobby, the wiki, and every dropdown. The same hue as the top bar so chrome reads as one material.
- **Foreground (`#F7FBEF`):** Warm parchment for body copy, headings, and primary chrome text.
- **Primary (`#F7B943`):** Match gold. The single accent — End Turn, Train, the player's turn indicator, focus rings, selected hex outlines. If everything is gold, nothing is.
- **Primary-foreground (`#4B2A0B`):** Deep cocoa-brown for text on gold so the contrast reads tactile rather than glassy.
- **Secondary (`#315A60`):** Stone-teal for inactive controls and HUD resource chips.
- **Muted (`#1C5364`):** Deeper teal mist for backgrounds that recede behind primary content.
- **Accent (`#087D97`):** Mid-saturation teal for hover lift and active rows.
- **Border (`#05536B`):** Deep teal stroke that gives chrome a carved edge against lifted surfaces.
- **Destructive (`#E0574A`):** Ember red for attacks, damage, forfeit confirmations.
- **Success (`#5FB77A`):** Mossy green for confirmations and the hex perimeter indicator.
- **Ring (`#FFD05A`):** Bright match gold for focus outlines — readable against every chrome surface.

**Hex-tile state colors** (`hex-selected`, `hex-attackable`, `hex-moveable`, `hex-perimeter`) are first-class tokens because board legibility depends on them. Treat them as reserved — do not reuse these hues for chrome.

**Tribe identity.** Nine tribes each carry a saturated sRGB hue (`tribe-barbarians` → `tribe-frostkin`). These colors appear on unit/village badges, score lists, and fog reveals. They live outside the warm palette on purpose — players need instant, unambiguous identification across a crowded board. Engineer yellow (`#CA8A04`) and skeleton bone (`#C7B99A`) use black foreground text; every other tribe uses `foreground`.

Twelve terrain types (tundra, terraced, jungle, barren, swamp, stone, forest, desert, ice, …) are rendered as SVG-noise-textured hex sprites, not as solid tokens. They belong to the art layer, not the design-system layer.

## Typography

Two variable serifs, both shipped via `@fontsource-variable`.

- **Cinzel Variable** — headings, labels, numeric HUD. Ancient, authoritative, carved-stone serif.
- **Crimson Pro Variable** — body copy. Warm, readable broadsheet serif.

**Hierarchy.**

- `display` (3.5rem / Cinzel 700) — hero landing moments only.
- `h1`–`h3` (Cinzel) — page and panel titles.
- `body-lg` / `body-md` / `body-sm` (Crimson Pro) — prose, wiki, descriptions.
- `label-caps` (Cinzel, 0.12em tracking, uppercase at usage site) — buttons, tabs, stat labels. Uppercase is applied with `text-transform`, not baked into strings.
- `numeric-hud` (Cinzel tabular figures) — gold, population, combat numbers. `font-feature: 'tnum'` is non-negotiable — stats must not jitter as they tick.

**Rules.** Cinzel never runs as prose. Crimson never runs as a button label. When in doubt, headings get Cinzel, everything else gets Crimson.

## Layout

**Board first, chrome second.** The hex grid is the star. UI panels dock, float, or collapse so the board always owns the majority of viewport pixels. If a new panel pushes board visibility below ~60%, it is too big. Match chrome should feel like chunky game controls: icon-first, high-contrast, and big enough for touch.

**Spacing scale.** The 4 → 72px scale (`xs` through `3xl`) is the only vocabulary. Do not invent one-off pixel values. Gaps between related controls live at `sm`/`md`; section separators at `lg`/`xl`; page-level composition at `2xl`/`3xl`.

**Stable scroll gutter.** `scrollbar-gutter: stable` is set globally — never toggle it per-route, because the hex board relies on the viewport not reflowing when a panel grows a scrollbar.

**Dock regions.** The online match (`/multiplayer-game`) and offline match (`/game`) share the same chrome layout: top-left player HUD, top-right turn / fog status, bottom action dock, and a collapsible right-side detail panel. Reuse that skeleton — don't reinvent per-route.

**Landing vignette.** The landing page uses a `radial-gradient` vignette (`--landing-vignette`) rather than a flat background. It is the only screen that gets atmospheric lighting chrome — match routes stay flat so the board reads cleanly.

## Elevation & Depth

Elevation is communicated through color lift (`background` → `card` → `popover`) and a 1px `border` stroke, not through glow or drop shadows. Three tiers:

1. **Flat (`background`).** The board, the landing canvas.
2. **Panel (`card`).** HUD, lobby rows, wiki article surface. Always sits on flat with a `border` outline.
3. **Float (`popover`).** Dropdowns, tooltips, confirm dialogs. Same color as `card` but with a single subtle shadow and a `border` outline.

No neon glow. No multi-layer drop shadows. Light comes from the gold accent — not from the chrome. Transient dialog overlays may use `backdrop-blur` to defocus the board; permanent chrome surfaces (top bar, action bar, HUD chips, status plaques) must not.

## Shapes

**Gently rounded.** `--radius` is `0.5rem`. Cards and panels pick up a soft 8px curve so the carved-teal chrome reads tactile rather than slabby. Buttons land at 6px (`md`), giving controls a clean tabletop edge without the harsh 0-corner of the previous draft.

**No hex-notch button clipping.** Buttons used to render with a `clip-path:polygon(...)` notch — that ornament was decorative, not informative, and is removed. The button shape now comes from `rounded-md` plus the chunky 2-color drop shadow.

**Hex is the only sharp organic curve.** The hex grid supplies the screen's organic geometry. Avoid large-radius blobs or full-circle hero shapes — they fight the grid.

## Components

Component tokens are defined in the YAML above and are the normative surface for agents. A few usage notes:

- **`button-primary`** is the firelight-gold CTA. One per screen region. "End Turn" is its canonical home.
- **`button-secondary`** is the default action. The overwhelming majority of buttons are this.
- **`button-ghost`** carries no fill — use for dismiss, cancel, and in-row actions where a filled button would be visually loud.
- **`button-destructive`** is for forfeit, delete account, and leave-match. It should feel deliberate — never the default.
- **`card`** is the only panel surface. Do not nest cards inside cards.
- **`input`** uses `interactive` rounding to signal it accepts focus, even though everything else is square.
- **`hex-tile-selected` / `-attackable` / `-moveable`** are rendered on top of terrain sprites as translucent overlays. The token colors are the _outline_ color; fills use the same hue at ~20% opacity.
- **`tribe-badge`** renders the nine tribe hues. Always pair with the correct foreground — `engineers` and `skeletons` take black text; every other tribe takes `foreground`.

## Do's and Don'ts

**Do**

- Lean into the board. Let the hex grid own the composition.
- Use `primary` (firelight gold) as an accent, not a fill. A single gold element per screen region reads as "this is the important one."
- Use `label-caps` (Cinzel, uppercase) for buttons and tab labels — the tabletop feel depends on it.
- Use tabular figures (`numeric-hud`) for any counter that updates during play.
- Reuse the nine tribe hues verbatim. They are the contract between the game state and the player's mental model.
- Keep panels flat. Color lift and a 1px border communicate elevation — that is enough.

**Don't**

- Don't introduce a stark dark-wood brown background. The brand is sunlit weathered teal, not aged-wood mahogany.
- Don't swap in system fonts "for readability." Cinzel and Crimson Pro are load-bearing.
- Don't reintroduce hex-notch `clip-path` clipping on buttons. The chunky drop shadow + `rounded-md` is the button shape.
- Don't add neon glows or gradient fills to chrome. Warmth comes from teal saturation + match gold, not lighting effects.
- Don't use `destructive` red for anything but genuinely destructive actions. It is a signal, not a color.
- Don't reuse tribe hues for UI chrome. They belong to the tribes.
- Don't add celebratory confetti, particle bursts, or juice animations. Polytopia's restraint is the benchmark.
- Don't render terrain color as a token. Terrain is art; tokens are chrome.
