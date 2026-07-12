# Claude Design brief — kalodimitrov.com design system

Purpose: formalize the client-approved v3 concept into a proper component
system, so Claude Code builds against designed states instead of improvising.
The v3 HTML file is the behavioral truth; Claude Design's job is visual
refinement, missing states, and the screens the concept doesn't cover yet.

---

## Master prompt (paste as the first message in Claude Design)

> You are designing the visual system for the portfolio of Kaloyan Dimitrov,
> a solo film/TV composer, sound designer and mix engineer (Sofia, Bulgaria).
> The direction is locked and client-approved from a working prototype:
> dark cinematic, full-bleed video, lowercase typographic voice, one warm
> "VU-meter amber" accent, waveform as the recurring brand motif.
>
> TOKENS (placeholder palette — will be swapped for values extracted from
> the client's old site, so use tokens religiously, never hardcoded colors):
> - bg #0b0b0d · ink #e9e4da · accent #e2a13c
> - meta rgba(233,228,218,.5) · line rgba(233,228,218,.14)
> - contact section inverts: bg=ink, text=bg, accent #a8781f
> - display+body: Archivo variable (wdth 62–125, wght 100–900);
>   titles wght 650 / wdth 76; meta labels 0.6–0.7rem, letter-spacing .2–.34em
> - everything lowercase; radius 0; scrim gradient for text-over-video
>
> LAYOUT LANGUAGE: full-viewport "cue" sections (one project per screen),
> oversized titles vs tiny meta (exaggerated hierarchy), cue numbers
> (cue 01, 02…) in accent, content bottom-left over video, breathing room.
>
> SIGNATURE MOTIF: the audio waveform. It appears as the sound toggle icon
> (5 animated EQ bars), the opener's reactive line, and a thin playhead line
> under video players. Do not introduce competing motifs.
>
> Design each component below at 390px and 1440px, with ALL listed states.
> Prefer refining over reinventing — the prototype screenshots I'll share
> are the approved baseline.

Then paste screenshots of v3 (opener choice screen, cue 01, detail overlay,
about, contact) as visual anchors.

---

## Component inventory (request one message each, in this order)

1. **header / nav** — default over video, scrolled (solid), mobile menu
   closed + open (fullscreen overlay with oversized lowercase links —
   NOT designed in v3 yet, highest-value new work), sound toggle on/off.
2. **opener** — choice screen (default, hover, focus), playing frame
   (waveform mid-riser), drop frame (flash + wordmark), outro frame
   (particles over emerging video), reduced-motion fallback (static).
3. **cue section** — with video, with poster-only, hover state,
   filtered-out (absent), mobile stacking of title/roles/desc/credits,
   long-title overflow behavior (e.g. investbulgaria "move to be moved").
4. **filter bar** — all states of the fader toggles, mobile placement
   (v3's floating pill may crowd small screens — propose alternative),
   zero-results state ("no cues in this channel — reset").
5. **cue rail** — default, active, hover, filtered (fewer items);
   propose mobile equivalent (v3 hides it — maybe a bottom progress line).
6. **detail overlay** — video loaded, video pending, loading state,
   prev/next hover, mobile layout (info stacks under player), Esc/close affordance.
7. **about block** — with real portrait (design for a photo, not the
   placeholder), mobile stack.
8. **clients marquee** — default; reduced-motion static wrap version.
9. **contact (light section)** — default, link hovers, mobile.
10. **footer** — one-liner, wrap behavior at narrow widths.
11. **NEW: 404 page** — "silence." + flatline waveform + link home (spec §8).
12. **NEW: loading/skeleton** — poster shimmer while video attaches.

## States the prototype skips (Claude Design's real value-add)

- keyboard focus-visible styling across every interactive element
  (accent outline, offset — must survive over video)
- error/empty states (video unavailable, zero filter results)
- the mobile nav (doesn't exist in v3 at all)
- light-section (contact) hover + focus states
- reduced-motion variants of every animated element

## Guardrails

- No new colors, no gradients-as-decoration, no rounded cards, no icon packs —
  the system's character is typography + video + one amber line.
- Don't "modernize" into generic AI-dark-portfolio: no acid green, no glass
  cards, no bento grids. The restraint IS the design.
- Any motion proposal must have a reduced-motion equivalent noted.
- Export/annotate spacing in the 4/8/16/24/40/64/104/168 scale (spec §9).

## Handoff back to Claude Code

For each approved component, capture: final screenshot pair (390/1440),
state list, and any token additions → drop into `docs/design/` in the repo
and reference from CLAUDE.md ("match docs/design/* for component states").
