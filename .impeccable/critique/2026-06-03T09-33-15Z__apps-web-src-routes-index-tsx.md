---
target: apps/web (landing surface)
total_score: 28
p0_count: 0
p1_count: 1
timestamp: 2026-06-03T09-33-15Z
slug: apps-web-src-routes-index-tsx
---

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                |
| --------- | ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | Saved-match loading state + toasts + presence bar; no nav-location cue (menu, mostly n/a)                |
| 2         | Match System / Real World       | 3         | Plain domain language ("Tribe", "Opponents", "Map size"); "New campaign" eyebrow slightly off-vocabulary |
| 3         | User Control and Freedom        | 3         | Back buttons in config, tab switch, guest exit; solid                                                    |
| 4         | Consistency and Standards       | 2         | Two button languages on one screen: chunky beveled MainMenuButton vs flat shadcn Button in AuthForm      |
| 5         | Error Prevention                | 3         | required/minLength, type=email, sophisticated saved-match conflict handling                              |
| 6         | Recognition Rather Than Recall  | 3         | Labeled icon buttons with hints; options visible                                                         |
| 7         | Flexibility and Efficiency      | 3         | Guest shortcut, ?mode deep-link; no keyboard accelerators (menu, low impact)                             |
| 8         | Aesthetic and Minimalist Design | 3         | Clean, board-first, focused; pre-auth content is a utilitarian sign-in form                              |
| 9         | Error Recovery                  | 3         | Inline ErrorMessage, authError surfaced, incompatible-match menu, plain language                         |
| 10        | Help and Documentation          | 2         | Wiki exists but is not reachable from the landing; first-timer gets no "how to play" pointer             |
| **Total** |                                 | **28/40** | **Good (lower band)**                                                                                    |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** This is hand-crafted, disciplined work.

**LLM assessment:** The surface reads as a real product, not a template. The OKLCH token system is thorough (gold/teal/ember press ramps with sRGB comments cross-referencing DESIGN.md), the reduced-motion handling is genuinely thoughtful (overrides `transition-property` to keep state-change feedback while killing movement, rather than nuking all transitions), and the static-painting → live-R3F-board swap on tribe select is a strong "this is a game" cue. No identical card grids, no gradient text, no glassmorphism, no hero-metric template.

**Deterministic scan:** `detect.mjs` returned `[]` (exit 0) on the four landing files AND on the full `src/routes` + `src/components` sweep. Zero findings. Clean.

**Visual overlays:** Not run. The landing is auth-gated and the dev server is a heavy SSR+Cloudflare-shim boot; I reviewed from source + token layer instead. No user-visible overlay exists for this run.

## Overall Impression

A confident, well-built surface that knows exactly what it is for a _returning_ player — and undersells itself to a _new_ one. The single biggest opportunity: the most compelling brand asset you own (the live animated hero diorama) is gated behind auth + tribe selection, so a first-time visitor's primary content is a "Welcome" sign-in form over a static painting. For a `brand`-register surface whose job is to "earn the evening," the page tells more than it shows before the moment of commitment.

## What's Working

1. **Token discipline.** `index.css` is a real system: one teal/gold/parchment palette, press-ramp chrome tokens, hex-state colors reserved, all OKLCH with sRGB cross-refs. This is why the detector is clean.
2. **Reduced-motion craft.** The `data-reduced-motion` override that preserves color/focus transitions while suppressing only transform/opacity is better than the blanket `0.001ms` reflex. Honors the brand's "approachable depth" without going lifeless.
3. **Board-first instinct.** The painting→live-board swap, the tribe-banner grid mirroring the lobby, the safe-area padding math — these show someone sweating the "one world, every route" principle.

## Priority Issues

- **[P1] Muted caps + tagline sit over a photographic background at low opacity.** `text-foreground/55` on the "Turn-based strategy" (0.42em) and "New campaign" eyebrows, and `text-foreground/75` on the tagline, render over `/landing-bg.jpg` with only `bg-background/60` + gradient between them. Near-white text at 55% alpha over a variable-luminance painting almost certainly fails WCAG 2.2 AA (4.5:1 for sub-18px text) in the lighter regions — and AA is your stated commitment.
  - **Why it matters:** It's your own accessibility bar, and small tracked caps are the worst case (tiny + low-contrast). Contrast over imagery can't be eyeballed; it has to be measured against the brightest pixels behind the text.
  - **Fix:** Either add a local scrim behind the text cluster (a subtle `background` radial or a `text-shadow` floor like the h1 already has), or raise the token to `foreground/75`+ for caps and `foreground/85`+ for the tagline, then verify against the lightest area of the painting.
  - **Suggested command:** `/impeccable audit` (contrast pass), then `/impeccable colorize` if tokens need reworking.

- **[P2] Two button design languages on the entry screen — and the weaker one greets new users.** The main menu uses the chunky beveled gradient `MainMenuButton` (gold/teal/ghost with inset highlights and drop bevels); the `AuthForm` — the first thing an unauthenticated visitor sees — uses the flat shadcn `Button` (`bg-primary`, no bevel). So the premium tabletop-token treatment is reserved for people who are already in.
  - **Why it matters:** Consistency & Standards; and it's backwards on impact. The first impression gets the plainer control.
  - **Fix:** Promote the primary auth CTAs (Sign In / Sign Up / Play as Guest) to the chunky chrome, or pull the menu buttons down to match — pick one button language for primary actions and apply it on first paint.
  - **Suggested command:** `/impeccable polish` (consolidate to one primary-button treatment).

- **[P2] Brand-new visitors land on a sign-in wall, default tab "Sign In", with Guest buried.** `Tabs defaultValue='sign-in'` means a first-timer (who has no account) sees the wrong tab first; "Play as Guest" sits below a `Separator`, visually demoted. The live hero board — the best "this is a real game" asset — only renders after auth + tribe pick.
  - **Why it matters:** PRODUCT.md says welcome newcomers and "earn the evening." This optimizes for the returning player and adds friction for the newcomer you want to convert.
  - **Fix:** Lead with low-friction entry (elevate "Play as Guest", or default to Sign Up for first visits), and consider letting the live diorama or a short "what you do here" beat appear _before_ commitment.
  - **Suggested command:** `/impeccable onboard` (first-run / activation pass).

- **[P3] No route from the landing to "how to play" / the wiki.** A confused first-timer has no in-context help affordance on the entry screen. The content exists (`/wiki`) but isn't surfaced where hesitation happens.
  - **Why it matters:** Help & Documentation (scored 2); first-timers abandon when the next step isn't obvious.
  - **Fix:** A quiet "How to play" or "What is Hexwardens?" link in the menu or header.
  - **Suggested command:** `/impeccable clarify` or `/impeccable onboard`.

- **[P3] A brand hero with no first-load motion.** The `brand` register _permits_ ambitious entrance choreography, and reduced-motion is already wired to make it safe. The logo + title appear statically while the board animates.
  - **Why it matters:** Missed polish on the one surface where motion is a brand permission, not a risk.
  - **Fix:** A restrained logo/title reveal on load (respecting the existing reduced-motion path).
  - **Suggested command:** `/impeccable animate`.

## Persona Red Flags

**Jordan (First-Timer):** Lands on "Welcome" + a Sign In form (a tab they can't use yet). "Play as Guest" is below a separator — easy to miss. No "how to play" anywhere. Likely hesitates or bounces before reaching the actual game.

**Casey (Distracted Mobile):** Mostly well-served — `coarse:` touch bumps (h-8→h-11), bottom-anchored CTA cluster via `mt-auto`, safe-area padding, `touch-action: manipulation`, no overscroll bounce. Red flag: the low-contrast tracked caps are hardest to read exactly in their context (outdoors, glare, small screen).

**Morgan (the board-game-night casual — from PRODUCT.md):** Wants cozy, inviting, low-stakes. The static painting + serif logo deliver mood, but the immediate ask is account creation, which reads more "service signup" than "pull up a chair." The warmth the brand promises arrives _after_ the commitment, not before it.

## Minor Observations

- "Welcome" as the AuthForm heading is generic; a line of brand voice would cost nothing.
- Eyebrow stack is dense: "Turn-based strategy" (0.42em tracking) + "Hexwardens" + tagline. 0.42em is extreme; the genre eyebrow and the tagline slightly overlap in job. Tracked Cinzel caps are legitimate brand voice (per DESIGN.md), so this is a tuning note, not slop.
- Note for the record: DESIGN.md commits to Cinzel + Crimson Pro. Crimson Pro is on the brand-register reflex-reject list, but identity-preservation wins for a shipped, committed brand — not flagging it as a defect.

## Questions to Consider

- What would a new visitor see in the first 3 seconds if the live diorama (or a 5-second gameplay loop) played _before_ the auth ask?
- Does the first screen need to be a sign-in form at all, or could "Play as Guest" be the hero and accounts be the upsell?
- If the chunky tabletop buttons are the brand's signature control, why doesn't the first impression use them?
