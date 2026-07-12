# CR-001 — Visual & functional change requests
kalodimitrov.com · raised after first working build · author: Mladen (Denkisa Dev)

How to use: hand this whole file to Claude Code. Each CR is independent and
numbered. Do not redesign anything not listed here — the current build and
docs/reference/site-concept-v3.html remain the baseline. Where a CR conflicts
with the reference, **this file wins**.

Priority: P1 = client-visible, do first · P2 = important · P3 = polish.
Open decisions are marked ❓ and must be resolved before that CR is built.

---

## A. IDENTITY & OPENER

### CR-1 — Wordmark on the opener (P1)
**Now:** the choice screen shows only the prompt text; the wordmark exists solely
as particles at the drop.
**Change:** render "kaloyan dimitrov" as a large, centered text logo **above** the
"this site is meant to be heard" block, with the tagline and the two entry
buttons stacked beneath it.
- Wordmark: `--font-display`, `clamp(2.2rem, 7vw, 5.5rem)`, wght 640 / wdth 76.
- Vertical order: wordmark → prompt → sub-line (sound design · original music ·
  final mix) → buttons. Whole stack optically centered, wordmark carrying the top.
- The particle formation at the drop must land on the **same position and size**
  as this static wordmark, so the drop reads as the logo "re-forming", not moving.
**Acceptance:** at 390px and 1440px the wordmark is centered, does not wrap
mid-word, and the drop-formed particle wordmark aligns to within ~2% of it.

### CR-2 — Studio photo behind the opener (P1)
**Asset:** `IMG_9569.JPG` (B&W wide studio — measured top-third luminance 31,
the darkest of the set, therefore the only one safe under centered text).
**Change:** place it full-bleed behind the opener canvas: grayscale, ~30% opacity
over `--color-bg`, with a very slow scale push-in (1.0 → 1.06 over 20s).
It stays visible through the choice screen and the cue, and fades out during the
outro as Viktoria emerges.
**Constraints:** this becomes the **LCP element** — it must be preloaded, and
must not push LCP past spec §11's 2.5s budget.
**Acceptance:** LCP ≤ 2.5s on throttled 4G with the image present; text contrast
over the image still ≥ 4.5:1 (see CR-12).

### CR-3 — Wordmark on internal pages (P1)
**Now:** small wordmark top-left in the header.
**Change:** larger and centered.
❓ **DECISION NEEDED — pick one:**
 (a) **Centered in the header:** logo centered, nav links split left/right around
     it. Elegant, but crowds at ≤768px and the sound toggle needs a home.
 (b) **Centered band above the nav:** two-row header — wordmark centered on row 1,
     nav centered on row 2. Roomier, costs ~40px of vertical space over the video.
 (c) **Centered, hides on scroll:** large centered wordmark on load, shrinks to a
     small left-aligned mark once the user scrolls past cue 01.
**Recommendation: (c)** — it gives the grand centered logo Mladen wants without
permanently eating the frame the videos need.

---

## B. HOME / CUE FEED

### CR-4 — Volume control for the in-feed videos (P1)
**Now:** background cue videos are permanently muted; sound only exists in the
detail player. The header EQ-bars toggle only gates UI blips.
**Change:** a volume icon on the home feed that **unmutes the video of the cue
currently in view**, so the reel can be watched *and heard* in place.
**Implementation:**
- Background embeds must load with `enablejsapi=1`; control via the YouTube
  IFrame Player API (`unMute()`, `setVolume()`, `mute()`).
- The user's click on the volume icon is the browser gesture that unlocks audio —
  this is required and must not be worked around.
- **Only the in-view cue may ever be audible.** On scroll, the outgoing cue fades
  out and the incoming cue fades in (recommended ~400ms crossfade) — never two
  audible sources.
- Sound preference persists across cues in `sessionStorage` and survives filtering.
- Opening the detail player mutes the feed; closing it restores the previous state.
❓ **DECISION NEEDED:** does this volume icon **replace** the existing EQ-bars sound
toggle, or sit beside it? **Recommendation: replace it.** One sound control, one
mental model — it drives feed audio *and* UI blips. Two toggles will confuse.
**Acceptance:** scrolling the feed with sound on produces exactly one audible
source at any moment; verified by inspecting player states, not by ear.

---

## C. WORK PAGE

### CR-5 — Thumbnails in the list view (P1)
**Change:** each row in the work list gets a thumbnail to the left of the title
(poster frame, 16:9, ~120–160px wide on desktop, ~72px on mobile).
Row layout: `[thumb] [cue no.] [title] [roles · client] [→]`.
**Acceptance:** rows keep a single-line rhythm at 1440px; stack legibly at 390px.

### CR-6 — Filters on the work page (P1)
**Change:** the same all / music / mix / sound design fader-toggle filter from the
home feed, filtering the work list.
**Implementation:** extract the filter into **one shared component** used by both
the home feed and the work page — do not duplicate the logic. Filter state should
be reflected in the URL (`?role=mix`) so a filtered view is linkable.
**Acceptance:** filtering works identically in list, gallery (CR-7) and home feed;
zero-results state (already built) still appears; back button restores state.

### CR-7 — Gallery view toggle (P1 — the biggest change)
**Change:** the work page gains a **view switcher** (list ⇄ gallery). Gallery is a
full-bleed responsive grid of video thumbnails.
**Grid:** full page width, edge to edge (no max-width container).
- ≥1400px: 3 per row · 900–1400px: 3 per row · 600–900px: 2 · <600px: 1.
- Tiles are 16:9, gapless or near-gapless (≤8px) so the page reads as a wall of film.
**Tile hover (desktop):** the still animates. Two acceptable implementations, in
order of preference:
 1. a short muted preview loop (6–10s) plays on hover;
 2. fallback — cross-fade between two poster frames (YouTube exposes
    `hqdefault`, `mqdefault`, `1.jpg`, `2.jpg`, `3.jpg` per video), giving a
    cheap animated effect with zero video cost.
Mobile has no hover: the tile in the center of the viewport auto-plays its preview.
**Tile content:** title (always visible, over a scrim at the bottom), roles on
hover, and a **"watch full video"** action that opens the same full-screen player
used from the home feed (CR-8) — same component, no second player.
**Filtering:** gallery respects CR-6 filters; tiles animate out/in on filter change.
**Persistence:** chosen view (list/gallery) is remembered in `sessionStorage`.
**Acceptance:** at every breakpoint the grid fills the viewport width with no
horizontal scroll; hover animation runs on ≤2 tiles simultaneously (performance);
`prefers-reduced-motion` and `prefers-reduced-data` disable hover previews and
serve static posters.

---

## D. VIDEO PLAYER

### CR-8 — Custom-controlled, near-fullscreen player (P1)
**Goal:** watching a film should feel like a cinema, not like YouTube.
**Change:** replace the native YouTube control bar with our own.
**Implementation:**
- Load the embed with `controls=0`, `rel=0`, `iv_load_policy=3`, `enablejsapi=1`,
  `playsinline=1`, and drive it entirely through the IFrame Player API.
- **Custom control layer** (auto-hides after 2.5s idle, returns on mouse move /
  tap / any key): play–pause · rewind 10s · forward 10s · volume (with mute) ·
  scrub bar with elapsed/total · previous cue · next cue · close.
- Style the controls in the site's language: thin amber playhead line (the
  waveform motif), lowercase micro-labels, no icon-pack look.
- Keyboard: Space = play/pause · ← / → = ±10s · ↑/↓ = volume · M = mute ·
  N / P = next/prev cue · Esc = close. All must be discoverable via a `?` hint.

**⚠️ HONEST LIMITS — tell the client:**
YouTube's branding cannot be fully removed. `modestbranding` no longer suppresses
the logo, and the YouTube wordmark / "Watch on YouTube" link can still surface on
pause and in end screens; embeds are also contractually not supposed to be
obscured. `controls=0` + a custom layer gets ~95% of the way. **The last 5% only
disappears on Vimeo Pro**, which permits full de-branding and progressive MP4
delivery. Build CR-8 against `VideoSource` so the Vimeo swap requires no redesign.

### CR-9 — Full-screen presentation, without cropping the film (P1)
**Requested:** "display the video to fill the entire screen like in the hero."
**Recommended implementation — and the reason:** a 16:9 trailer force-filled into
a wider viewport must be cropped, which cuts off the frame the film's director
composed. So:
- The video is **letterboxed to its true aspect** (`object-fit: contain`), scaled
  to the largest size that fits the viewport.
- The surrounding area is filled with a **blurred, dimmed, scaled copy of the same
  video** (ambient spill, ~40px blur, 35% brightness) so the screen reads as full
  and cinematic with no black bars.
- Background loops on the home feed **keep** the current `cover`/crop behavior —
  they're decorative, cropping is fine there.
❓ Mladen may overrule: if you truly want edge-to-edge crop in the player, say so
and it's a one-line change — but the trailer will lose its top and bottom.
**Acceptance:** no letterbox bars visible; no part of the source frame cropped.

---

## E. ASSETS — studio photography

### CR-10 — Place the studio photos (P2)
Five photos supplied. Assignments (chosen on measured luminance so text stays legible):

| Slot | Asset | Treatment |
|---|---|---|
| Opener background | `IMG_9569.JPG` | grayscale, 30% opacity, slow push-in (see CR-2) |
| About | `IMG_6235.jpg` (window into the live room) | full-bleed, **unfiltered**, replaces the 4:5 portrait placeholder with a 4:3 image |
| Contact | `IMG_8950.jpg` (Neve 8803 / Drawmer VU meters, B&W) | full-bleed band behind the light contact block; keep text contrast ≥4.5:1 |
| About, secondary | `IMG_6681.jpg` (Rhodes + keys, colour) | optional second image |
| 404 | `IMG_6236.jpg` | heavily darkened |

**Technical:** all five are 4032×3024. They must live in `src/assets/` (NOT
`public/`) so Astro emits responsive AVIF/WebP at sensible widths. The opener
image is the LCP element and must be preloaded.

❓ **DECISION NEEDED — colour policy.** The studio is full of saturated colour
(orange / teal / red / mustard acoustic panels). This fights the austere
dark + single-amber system. Two coherent answers:
 (a) duotone all photos into the palette — maximum system consistency;
 (b) let the **photographs be the one place colour lives** — unfiltered, full-bleed.
**Recommendation: (b).** The restraint everywhere else is what makes the colour
land, and it stops the site reading as generic dark-portfolio.

**Note:** the client's rack (Drawmer 1973, Neve 8803) has **amber-lit VU meters** —
the accent colour chosen at concept stage is literally the light in his studio.
Worth telling him; it's a good story and it validates the palette.

---

## F. DEFECTS FOUND IN AUDIT (fix alongside)

### CR-11 — Micro-typography is too small (P2)
Measured in the live build: kind label **9.9px**, scroll hint **9.0px**, footer
**9.6px**, role line **10.9px** — all with ~0.3em letter-spacing, which actively
harms legibility at that size.
**Change:** floor all meta text at **11px**; cap letter-spacing at **0.22em**.
**Acceptance:** no rendered text below 11px anywhere at any breakpoint.

### CR-12 — Contrast is only verified against the background, not the video (P2)
All text currently passes AA against `#0b0b0d` — but the meta text sits at 60%
alpha **over moving footage**. On a bright frame (Audi's snow, InvestBulgaria's
daylight) it will fall below 4.5:1.
**Change:** strengthen and heighten the scrim behind the text block, and/or raise
meta text to full opacity. Verify against the **brightest frame** of each cue video,
not against the page background.
**Acceptance:** ≥4.5:1 measured against a sampled bright frame of cue 03 and cue 04.

### CR-13 — Tap targets below 44px (P2)
32 interactive elements are under 44px. Worst: cue-rail numbers **12px tall**,
mobile hamburger **24×18px**.
**Change:** pad hit areas to ≥44×44px. Visual size may stay as designed.
**Acceptance:** zero interactive elements under 44px at 390px width.

### CR-14 — Mobile filter pill wraps and crowds the video (P3)
At mobile width the floating filter pill grows to **77px tall** and sits directly
over the video beneath the header.
**Change:** mobile-specific treatment — a horizontally scrollable single row, or
fold the filters into the mobile menu overlay.
**Acceptance:** filter UI occupies ≤44px of vertical space at 390px.

### CR-15 — Credits block never got ported (P3)
`.cue .credits` does not exist in the DOM. The reference shows per-cue credits
(dir / dop / edit / sd) which were scraped from the old site and are real.
**Change:** restore the credits line on cues that have credit data.
**Acceptance:** cue 01 shows dir maya vitkova · dop krum rodriguez · edit
alexander etimov · sd kamen atanasov.

---

## G. VERIFICATION (run before declaring CR-001 done)
1. `npm run build` passes.
2. Chrome DevTools MCP performance trace, 4G throttled: LCP ≤2.5s, CLS ≈0,
   initial JS <80KB gzip — **with the opener photo in place** (spec §11).
3. Keyboard-only pass at 390px and 1440px, including the new player controls
   and the gallery grid.
4. `prefers-reduced-motion` pass: no hover previews, no push-in, no auto-audio.
5. Sound test: scroll the whole feed with sound on — exactly one audible source
   at all times; opening/closing the player restores state correctly.
6. Screenshot list view, gallery view, and the player at both breakpoints.

## H. OPEN DECISIONS BLOCKING BUILD
- ❓ CR-3: header wordmark treatment (a / b / **c**)
- ❓ CR-4: volume icon replaces the EQ toggle? (**recommend: yes**)
- ❓ CR-9: letterbox-with-ambient-fill (**recommended**) vs true edge-to-edge crop
- ❓ CR-10: photo colour policy — duotone (a) vs colour-lives-in-photos (**b**)
