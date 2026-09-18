<!-- SEED: this direction has been built and validated across the full 9-step
customer wizard (design-prototype/ — Loan Requirements through Review &
Submit, standalone static pages, not yet wired into frontend/). It is not
yet the app's shipped visual system. Re-run `/impeccable document` once this
direction is approved and implemented in the real Angular app, to capture
the actual production tokens/components and drop this notice. -->

---
name: DigiBank — Signal Gold
description: Dark-first neo-bank direction for DigiBank's customer journey, inspired by Revolut/Monzo/Freetrade, deliberately bolder than Apple-style restraint.
colors:
  bg: "#0b0c14"
  bg-elevated: "#14151f"
  bg-elevated-2: "#1c1e2b"
  bg-elevated-3: "#262838"
  border: "rgba(255, 255, 255, 0.08)"
  border-strong: "rgba(255, 255, 255, 0.16)"
  text-primary: "#f4f3f7"
  text-secondary: "#a8a6c0"
  text-tertiary: "#8987a6"
  signal-gold: "#ffb833"
  signal-gold-deep: "#e09b1e"
  gold-ink: "#241a05"
  ledger-mint: "#35e0a1"
  alert-coral: "#ff6b6b"
typography:
  display:
    fontFamily: "Space Grotesk, Segoe UI, sans-serif"
    fontSize: "clamp(3rem, 9vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Space Grotesk, Segoe UI, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.35rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, Segoe UI, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Segoe UI, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 600
rounded:
  sm: "10px"
  md: "14px"
  lg: "20px"
  pill: "999px"
spacing:
  sm: "10px"
  md: "20px"
  lg: "40px"
  xl: "88px"
components:
  button-primary:
    backgroundColor: "{colors.signal-gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.md}"
    padding: "15px 30px"
  button-primary-hover:
    backgroundColor: "{colors.signal-gold-deep}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.md}"
    padding: "15px 30px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  pill-unselected:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  pill-selected:
    backgroundColor: "{colors.signal-gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  input:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "13px 16px"
  input-focus:
    backgroundColor: "{colors.bg-elevated-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "13px 16px"
---

# Design System: DigiBank — Signal Gold

## Overview

**Creative North Star: "The Vault at Night"**

A digital bank's after-hours trading floor, not a brochure: near-black ink surfaces, one precise gold signal, and numbers that mean something the instant they change. Where DigiBank's original portal (TCS Blue/Yellow, light chrome, card grids) reads as a form to fill in, Signal Gold reads as a live instrument the customer is operating — closer to Revolut's dark ticker energy and Monzo's confident single-accent discipline than to Apple's deliberately quiet neutrality, which this brief explicitly rejected as too bland for a product whose whole point is "how much money, on what terms."

Gold was chosen over the more expected neo-bank accents (electric purple, hot coral, mint-teal) because it's load-bearing: it reads as *value* in a lending product, not just as a brand color, and it lets DigiBank retire its literal blue/yellow palette while still rhyming with "yellow = DigiBank" at a conceptual level.

**Key Characteristics:**
- Near-black tinted base (never pure black or neutral gray) with a single saturated gold signal
- No boxed cards anywhere — pills, a slider, and a segmented switch carry the interface instead
- Every large numeral on screen is a real, live-computed value, never a decorative stat
- Space Grotesk for anything the eye should land on first; Inter for everything read in sequence
- One signature motion grammar (the "sheet advances" transition) carries every step-to-step move, not scattered per-element entrances
- A long form is broken into focused sub-screens (dots, not more scroll) the moment it covers more than one real topic

## Motion

**Character:** CRED-adjacent — a satisfying, tactile "sheet advances" feel between steps, plus one genuine celebratory close. Never decorative animation layered onto a static design; every moment here is load-bearing (it marks a real state change: a new step, a new sub-step, the application actually being submitted).

- **Step transition** (every wizard-step and sub-step change): the outgoing content fades and lifts slightly (`translateY(-14px)`, 200ms), the incoming content fades and settles in from below (`translateY(18px)→0`, 480ms, `--ease-out-expo`). Persistent chrome (the top bar) never re-animates — only the content that actually changed moves, which is what makes it read as one continuous app rather than nine separate page loads.
- **Progress fill:** the newly-current step segment sweeps in from empty (`scaleX(0)→1`, 520ms) the moment its page loads; completed segments are simply already gold, no replay.
- **The close:** Review & Submit's successful submission is the one deliberately bigger moment in the whole system — a gold ring draws itself, a checkmark draws inside it, two soft rings pulse outward and fade, then the confirmation copy settles in. Reserved for the single moment that actually deserves weight; using it anywhere else would cheapen it.
- **Respects `prefers-reduced-motion`:** every animation above has a reduced-motion fallback that shows the end state immediately, no transition skipped silently.

### Named Rules
**The One Moment Rule.** A page transitions exactly one way, every time. A second, different transition style anywhere in the product means the grammar broke, not that a screen earned an exception.

### The Tactile Layer (micro-interactions)

A second, smaller-scoped grammar, distinct from the page-level moment above and never competing with it — three named moments, applied to every interactive control, nothing outside them:

1. **Press** — every tappable control (pill, both button kinds, switch option, bank row, upload zone, the slider thumb) scales down slightly on `:active` (0.95–0.99 depending on the control's size) with a fast 120–140ms response. This is what makes a static screenshot-like surface feel like it's actually being touched.
2. **Selection pop** — the instant something becomes *chosen* (a pill gets picked, a consent checkbox gets checked), it plays one quick scale bounce (1 → 1.06 → 1, ~250ms) — a small, consistent "confirmed" beat, not a celebration (that's reserved for the close).
3. **Reveal** — any content the app inserts on its own (a connected bank account, an uploaded file row, the "verified" badge, a previous-address block, an extra employment row) fades and settles in (`translateY(6px)→0` + a touch of scale, ~260–320ms) instead of snapping into existence. A `.micro-reveal` utility class exists for one-off JS-inserted blocks that don't already have a named component style.

All three respect `prefers-reduced-motion` (animations disabled, end state shown immediately), same as the page-level moment.

**The Two-Layer Rule.** Every animation in this system belongs to exactly one of two grammars: the page-level sheet transition (navigation) or the tactile layer (press / selection / reveal). If a new animation doesn't obviously belong to one of those two, it's scope creep, not craft.

## Colors

Committed strategy: gold carries every primary action and every "this is selected" state; nothing else competes with it for that job.

### Primary
- **Signal Gold** (`#ffb833`): the one accent. Primary buttons, the selected state on every pill/chip/segmented control, the slider fill and thumb, the large amount figure, the brand mark. Nowhere else.
- **Signal Gold, Deep** (`#e09b1e`): hover/pressed shade for gold surfaces, and the second stop in gold's gradient fills.

### Secondary
- **Ledger Mint** (`#35e0a1`): reserved for positive system feedback (eligibility confirmations, "approved," "on track" states) — not yet used in the built prototype, staged for the next surface. Never a selection color.
- **Alert Coral** (`#ff6b6b`): validation and error states only (e.g. the unfilled-purpose outline). Never decorative.

### Neutral
- **Vault Ink** (`#0b0c14`): page background. A tinted near-black (blue-violet undertone), not a true black — true black would flatten the gold glow and read as OLED-saver rather than a chosen material.
- **Raised Ink** (`#14151f`): first elevation tier — pill backgrounds, the switch track.
- **Raised Ink, Deep** (`#1c1e2b`): second elevation tier — unfilled slider track, inactive step segments.
- **Raised Ink, Deepest** (`#262838`): reserved third tier for future denser surfaces (e.g. a dashboard card once this direction expands there).
- **Paper White** (`#f4f3f7`): primary text. Soft off-white, never pure `#fff` — pure white against Vault Ink reads clinical rather than premium.
- **Dusk Violet-Gray** (`#a8a6c0`): secondary text — tinted from the same violet undertone as the background, per the craft rule that secondary text on a colored ground is tinted, never plain gray.
- **Faint Dusk** (`#8987a6`): tertiary text — scale labels, timestamps, the step-count caption. Lightened from an initial `#6f6d8a` after it measured 3.66:1 against `Raised Ink` — this value holds 5.25:1, clearing the WCAG 2.1 AA body-text floor PRODUCT.md commits to.

### Named Rules
**The One Signal Rule.** Gold is the only color that means "act here" or "this is chosen." The moment a second saturated color is used for selection or emphasis in the same control group, the system has lost its own discipline.

## Typography

**Display Font:** Space Grotesk (with Segoe UI, sans-serif fallback)
**Body Font:** Inter (with Segoe UI, sans-serif fallback)

**Character:** Space Grotesk's geometric, faintly technical letterforms give the amount figure and headings a confident, ticker-adjacent voice without tipping into a monospace "data" costume; Inter stays the quiet, highly legible workhorse for everything read in sequence — labels, body copy, button text — so the display face never has to compete with itself.

### Hierarchy
- **Display** (700, `clamp(3rem, 9vw, 4.75rem)`, line-height 1): the loan amount figure — the one number the whole step exists to let the customer set.
- **Headline** (600, `clamp(1.75rem, 4vw, 2.35rem)`, line-height 1.15): the step's single question ("How much would you like to borrow?").
- **Label** (600, 0.88–0.95rem): field labels, pill/button text, all-caps never used.
- **Body** (400, 0.92rem, line-height 1.5): the repayment estimate line and any supporting copy.
- **Caption** (400–500, 0.75–0.85rem): step counter, slider min/max scale, error text.

### Named Rules
**The No-Kicker Rule.** No eyebrow/kicker label ever sits above a heading in this system. The headline carries its own weight.

## Layout

Single centered task column, max-width 640px, generous vertical rhythm (40–44px between field groups, more space above a heading than below it). No sidebar, no multi-column grid on this surface — the whole point of the direction is one decision at a time, full attention. A slim top bar carries the wordmark, a minimal 9-segment progress track (filled segments only, no numbers, no checkmarks), and a "Save & exit" escape hatch. A sticky bottom bar keeps the primary action reachable at all times, mirroring native mobile-banking conventions rather than a page-bottom form submit. Responsive: the step-progress track hides below 720px (the step caption alone carries that information); the term pill row becomes a horizontal scroller rather than wrapping into a dense grid.

## Elevation & Depth

Flat-tonal, not shadow-driven: depth comes from three layered near-black tiers (Vault Ink → Raised Ink → Raised Ink Deep/Deepest), not from drop shadows on generic surfaces. The one exception is gold itself — the primary button, the slider thumb, and the brand mark carry a soft, offset, gold-tinted glow (never a zero-offset halo) because those are the elements the interface wants the eye to land on.

### Shadow Vocabulary
- **Signal glow** (`0 10px 26px -8px rgba(255,184,51,0.35)`): primary button and slider thumb at rest.
- **Signal glow, active** (`0 14px 32px -8px rgba(255,184,51,0.35)`): primary button hover.
- **Brand mark glow** (`0 3px 10px rgba(255,184,51,0.35)`): the small brand mark only.

### Named Rules
**The Flat-By-Default Rule.** Nothing gets a shadow just for existing. A surface earns a shadow only by being gold.

## Shapes

Soft, continuous rounding throughout — 10px on ghost buttons, 14px on primary buttons and the slider track's parent spacing, 20px reserved for any future larger container, and full pill radius (999px) on every selectable control (chips, the applicants switch, the slider thumb). No sharp corners anywhere in this world; no hairline borders heavier than 1px.

## Components

Card-less by design: this surface has no bordered containers at all. Selection and input live entirely in pills, a range slider, and a segmented switch.

### Buttons
- **Shape:** 14px radius (ghost buttons use 10px, being smaller-scale actions).
- **Primary:** gold gradient (`Signal Gold → Signal Gold Deep`, 160deg) on `gold-ink` text (near-black, for contrast on the light accent), 15px/30px padding, signal glow shadow.
- **Ghost:** transparent, 1px `border-strong` outline, `text-secondary` label; hover fills to Raised Ink and brightens the label to `text-primary`.
- **Disabled:** 40% opacity, shadow removed, no transform.

### Chips / Pills
- **Style:** Raised Ink background, 1px hairline border, `text-secondary` label, full pill radius.
- **Selected:** fills solid Signal Gold, text flips to `gold-ink`, weight steps up to 600.
- **Hover:** border brightens to `border-strong`, text lifts to `text-primary`.

### Segmented Switch
- **Style:** Raised Ink track, 4px inset padding, a gold pill "thumb" that slides between two **equal-width** (`grid-template-columns: 1fr 1fr`) options — equal width is load-bearing, not cosmetic: unequal option widths break the thumb's 50%-based slide math.

### Slider
- **Track:** 6px, Raised Ink Deep unfilled / Signal Gold filled (filled portion driven by a `--fill` custom property in %).
- **Thumb:** 24px circle, Signal Gold fill, 4px Vault Ink border (so the thumb reads as floating above the track), signal glow; on drag, gains a soft 6px gold ring.

### Navigation (top bar)
- Wordmark left (brand mark + Space Grotesk wordmark), a centered minimal 9-segment progress track with a caption underneath (filled segments mark completed steps, not just the current one), a ghost "Save & exit" action right. Shared across all 9 wizard steps via a single `WIZARD_STEPS` list, never hand-rolled per page.

### Text Input / Select
- **Style:** Raised Ink background, 1px hairline border, 14px radius, `text-primary` value on `text-tertiary` placeholder.
- **Focus:** border shifts to Signal Gold, background steps up one elevation tier (to Raised Ink Deep) — no glow on inputs; the glow budget is spent on gold surfaces only.
- **Error:** border shifts to Alert Coral.
- **Select:** a custom chevron (inline SVG, matches the icon stroke weight) replaces the browser default; no native appearance.

### Upload Zone
- **Style:** 1.5px dashed border, 20px radius, generous internal padding, an outlined cloud icon and two-line copy, centered.
- **Hover / drag-over:** border and icon shift to Signal Gold, background gains a barely-there gold tint (5% opacity) — the only place a "wash" of the accent color is allowed, because it's the target of an active drag, not decoration.
- **Uploaded file:** a Raised Ink row with a Ledger Mint check icon (the one sanctioned non-error use of Ledger Mint outside eligibility feedback — confirmation that a file landed) and a remove action.

### Consent Modal
- **When used:** only for a genuine interrupt-and-protect-focus moment (e.g. credit bureau / PEP / sanctions / data-processing consent) — never for a task that could stay inline. This is the one exception to the surface's card-less rule, because a modal is structurally different from a card: it's an interruption, not a content container.
- **Style:** a centered Raised Ink panel, 20px radius, over a blurred near-black scrim. Consent rows use a custom gold checkbox (never the browser default), each gated as required; the confirm action stays disabled until every box is checked.

### Bank / Account Row
- **Style:** a full-width Raised Ink row (not a card — no padding-heavy icon-tile treatment), a small circular initials mark, name, and metadata in `tabular-nums`. A connected account carries a small gold "Primary" pill badge.
- **Connecting state:** a spinner (gold arc on a Raised Ink Deep ring) plus "Connecting to [bank]…" text — no skeleton shimmer, no progress bar; the point is speed, not simulated suspense.

### Summary Row (Review & Submit)
- **Style:** label/value pairs in a single column, hairline dividers between rows, section headers each carrying a small "Edit" link back to that step. The one summary figure that matters most (loan amount) is the only row in gold; everything else stays `text-primary`/`text-secondary` so gold keeps meaning "this is the headline number," not "every number here."

### Signature Field
- **Style:** no input box — a bottom-hairline-only field, Space Grotesk italic in Signal Gold once text is entered, so the electronic signature visually reads as a signature rather than another form field.

### Sub-stepper (in-step focus screens)
- **When used:** a single wizard step covers more than one real topic (e.g. Personal Details: identity, then contact & address, then branch assistance) — Personal Details is the shipped example, at 3 sub-screens. The rule of thumb: if a step's content wouldn't fit one phone viewport without scrolling past what one thesis heading can hold, it's a sub-stepper candidate, not a longer scroll.
- **Style:** small pill dots (not a second progress bar) above the step's own thesis heading — active dot wider and gold, done dots gold-deep, upcoming dots the neutral track color. The heading text itself changes per sub-screen (its own one-line question), so each sub-screen still reads as "the first viewport is a thesis," just a smaller one.
- **Navigation:** the wizard-level Back/Continue bar doubles as the sub-stepper's nav — Back steps back one sub-screen (or leaves the wizard step entirely from sub-screen 1); Continue relabels to "Save & Continue" only on the last sub-screen, where it does the step's real save/gate action (e.g. the consent modal). No separate mini nav bar.

## Do's and Don'ts

### Do:
- **Do** use Signal Gold for exactly one job per control group: the primary action, or the selected state. Never both competing in the same group without a clear primary/secondary read.
- **Do** tint every secondary/tertiary text color from the background's violet undertone (`Dusk Violet-Gray`, `Faint Dusk`) — never a plain neutral gray.
- **Do** keep large numerals in Space Grotesk with `font-variant-numeric: tabular-nums` so they don't visually jitter as digits change.
- **Do** keep this surface (and any surface built in this world) effectively card-less unless a genuinely new content type (e.g. a transaction list) requires a bounded container.

### Don't:
- **Don't** introduce a second saturated accent (a purple, a teal, a second gold-adjacent hue) competing with Signal Gold for attention. Ledger Mint and Alert Coral are feedback-only, never decorative.
- **Don't** reach for a drop shadow on a non-gold surface. Depth is the three ink tiers, not `box-shadow`.
- **Don't** fall back to Inter, or any system sans, as the display voice for headings or large numerals — Space Grotesk is the committed display face for this world.
- **Don't** revive the retired DigiBank Blue (`#003F79`) or Yellow (`#F5A200`) inside this direction; they belong to the pre-redesign brand world documented in `PRODUCT.md`'s Brand Commitments, not to Signal Gold.
