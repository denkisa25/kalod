# docs/design — state comps (v3: logo + gold accent update)

- `--color-bg: #0e0f10`, `--color-ink: #c9c9cb`, `--color-heading: #ffffff`, `--color-accent: #c99a55` (yellow-brown/gold, pulled from the ambient bg-loop pattern — was blue in the prior pass)
- Brand wordmark ("kaloyan dimitrov") now renders **uppercase, white, Agency FB** everywhere it appears (header, opener) — a logo-specific exception to the site's lowercase body-copy rule.
- `--font-display: 'Agency FB', 'Bahnschrift', 'Arial Narrow', sans-serif` — Agency FB is now **self-hosted** from the client's own uploaded font files (`fonts/AgencyFB-Regular.*`, `fonts/AgencyFB-Bold.*`), so it renders on every platform, not just Windows.
- `--font-body: Verdana, Geneva, sans-serif` — system font, no upload needed (Geneva is a further fallback only).
- `--surface-gradient` — warm gold-to-black page backdrop. Still a reasoned approximation, not a pixel-sampled extraction from the live kalodimitrov.com. Send a screenshot if you want a pixel-accurate match.

## Bug found + fixed during this pass
`HeaderNav`'s fullscreen mobile menu (`z-index: 39`) was nested *inside* `<header>` and painted over
the brand/hamburger-close controls (which had no explicit stacking, i.e. `z-index: auto`) once the
menu opened — the close (✕) affordance became invisible and untappable. Fixed by giving the brand
link and the toggle-controls wrapper `position: relative; z-index: 41`, so they now stay visible and
clickable above the open menu. Verified via live DOM hit-testing (`elementFromPoint`), not just
visually — `mobile-nav.png`'s "open" frame under-represents the fix because the screenshot tool has
a known fidelity limitation with nested `position: fixed` + z-index stacking (documented in-tool);
the real interactive component is correct.

## Files
- `mobile-nav.png` — HeaderNav mobile, closed + open, 390px
- `focus-states.png` — focus-visible ring spec (2px solid accent, 4px offset) over video, inverted section, default surface
- `error-states.png` — DetailOverlay "pending" (video unavailable) + FilterZeroResults (zero filter results)
- `skeleton.png` — LoadingSkeleton, cue + detail layouts
- `404.png` — NotFoundPage: "silence." + flatline waveform + home link
- `mobile-rail.png` — desktop CueRail vs. proposed mobile CueProgressLine (bottom line)

All components live in `components/`; these PNGs are point-in-time exports for handoff, not the source of truth.
