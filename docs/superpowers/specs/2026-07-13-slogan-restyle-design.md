# Site-wide slogan restyle: "sound design · original music · mix creative"

Date: 2026-07-13
Status: approved, ready for implementation plan

## Context

Two separate lines currently exist under the wordmark, in different places,
with different text:

1. **Opener choice screen** (`#choice .sub`, `src/components/Opener.astro`):
   reads "sound design · original music · final mix", styled small and
   muted (`font-size: 0.7rem; color: var(--color-meta)`).
2. **Site header** (`.brand small`, `src/components/Header.astro`): reads
   "music + sound post", same small/muted styling, shown on every page
   (home, work, about, contacts, all 48 project pages) under the wordmark
   at whatever size the header's current state (hero/compact) renders it.

Per discussion, these become ONE consistent slogan, styled larger and in
the site's accent colour, replacing both existing lines everywhere.

**Explicitly out of scope:** the opener's animated sequence (particle
formation spelling the wordmark, timed thumps/hits, drop flash, outro
release) stays exactly as it is — confirmed this already anchors correctly
to the static wordmark's position (original CR-1 requirement), no changes
needed there. This spec only touches the static text line, not the canvas
animation.

## New design

- **Text:** "sound design · original music · mix creative" — replaces both
  "sound design · original music · final mix" (opener) and "music + sound
  post" (header), everywhere.
- **Colour:** `var(--color-accent)` (the site's gold/brown accent,
  `#c99a55`) — no new token, reuses the existing one.
- **Size:** increased from the current `0.7rem` meta-text size to
  `clamp(0.85rem, 1.8vw, 1.05rem)` — noticeably bigger without competing
  with the wordmark or prompt line above it.
- **Everything else unchanged:** letter-spacing stays `0.22em` (matches
  the sitewide meta-text tracking convention), lowercase (inherited from
  `body`), same position (directly under the wordmark).
- **Applies to:** the opener choice screen, and the header on every page
  that renders it (home in both hero and compact scroll states, work,
  about, contacts, all 48 project pages) — one shared text/style, not
  per-page variants.

## Acceptance criteria

- Opener choice screen shows the new text, larger, in accent colour.
- Header's `.brand small` shows the same new text, same styling, on every
  page — including the home page after scrolling past cue 01 (compact
  header state).
- No occurrence of "music + sound post" or "final mix" remains in rendered
  markup.
- `npm run build` passes; screenshot the opener and one internal page
  (e.g. `/work`) at 390px and 1440px to confirm legibility and that the
  bigger/brighter text doesn't crowd the wordmark above it or the
  prompt/buttons below it (opener) or the nav (header).
