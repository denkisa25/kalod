# CR-001 addendum + Claude Code session package
kalodimitrov.com · companion to `cr-001-visual.md` — read that first.

---

# PART 1 — CR-16: the heritage background pattern (P1)

## What it is (extracted from the live legacy site)
- **Asset:** `https://kalodimitrov.com/wp-content/themes/kaloyan/images/bgr.jpg`
- **Dimensions:** 200 × 1260 px (a narrow vertical strip)
- **Legacy application:** `background-repeat: repeat-x` + `background-attachment: fixed`
  on `<body>` — tiled horizontally, pinned to the viewport while content scrolls.
- **Character:** steel blue-grey gradient texture. Luminance falls top→bottom
  174 → 89. Dominant colours: `#607080`, `#506070`, `#405070`, with a warm
  grey-olive highlight `#a0a090`. Legacy body text: white, 11px Verdana.
- The client is attached to this pattern. **It is brand equity — preserve it.**

## The idea it unlocks — "the cinema and the room"
Two visual worlds, deliberately opposed:
- **Cinema** — home cue feed and the video player: pure black, full-bleed video,
  no texture, no chrome.
- **The room** — work page, about, contact, 404: the heritage pattern as the
  ground the content sits on.
This gives the pattern a *reason* to exist rather than being decoration, and it
makes the video pages hit harder by contrast.

## Requirements
1. **Download and self-host** the asset (do not hotlink the old WordPress install,
   which is being decommissioned). Export a WebP alongside the JPEG.
2. **Apply to:** `/work` (both list and gallery views), `/about`, `/contacts`, `/404`.
   **Do NOT apply to:** the opener, the home cue feed, or the video player — those
   stay black.
3. **Implementation — do NOT use `background-attachment: fixed`.** It is broken /
   janky on iOS Safari. Instead render the pattern in a dedicated layer:
   ```css
   .heritage-bg {
     position: fixed; inset: 0; z-index: -1;
     background-color: #4a5a6a;                    /* matches the strip's dark bottom */
     background-image: url('/patterns/bgr.webp');
     background-repeat: repeat-x;
     background-position: top center;
   }
   ```
   Content scrolls over it; the pattern stays pinned. Same effect as the original,
   without the mobile bug.
4. **The strip is only 1260px tall and does not tile vertically.** Below 1260px the
   background-colour must take over seamlessly — sample the strip's bottom row and
   use that exact colour so there is no visible seam on tall viewports.
5. **Legibility.** The pattern's upper region is light (lum 174). Our `--color-ink`
   text will fail WCAG AA there. Apply a tint layer over the pattern so all body
   text keeps ≥4.5:1:
   ```css
   .heritage-bg::after {
     content:''; position:absolute; inset:0;
     background: rgba(11,11,13,.55);   /* tune to hit the contrast target */
   }
   ```
   ❓ **DECISION — pattern intensity.** (a) tinted, as above: the texture reads as a
   subtle ground inside our dark system (**recommended**); (b) near-raw, closer to
   the legacy look, which forces text to go white/heavier and pulls the whole site
   toward the old palette. Show the client both.
6. **Contact section conflict:** contact is currently a *light* inverted section
   (CR-10 also puts the VU-meter photo there). Pattern + light section + photo is
   too many ideas. ❓ **DECISION:** either contact keeps the light inversion and
   the pattern is skipped there, or contact drops the inversion and sits on the
   pattern with the VU photo as a band. **Recommend the latter** — it keeps the
   "room" concept coherent.
7. **New token:** add `--color-surface-steel: #506070` (sampled from the pattern) to
   the token set as a legitimate brand colour. It may be useful for borders and
   hovers on the pattern pages.
8. `prefers-reduced-motion` / performance: the pattern is a static tiled image —
   no parallax, no animation. Keep it that way. WebP must be <40KB.

**Acceptance:** pattern visible and pinned on /work, /about, /contacts, /404; no
seam at any viewport height up to 2000px; no iOS scroll jank; all text on pattern
pages ≥4.5:1; black cinema pages entirely unaffected.

---

# PART 2 — ASSETS: where everything goes

Before running any session, place the files:

```bash
cd ~/dev/kalodimitrov-site

# 1. studio photography (5 files) → src/assets so Astro optimises them
mkdir -p src/assets/studio
cp ~/Documents/FAMILY/MLADEN/kalodimitrov/docs/studio/*.{jpg,JPG} src/assets/studio/

# 2. heritage pattern → public (it's a tiled CSS background, not an <img>)
mkdir -p public/patterns
curl -o public/patterns/bgr.jpg \
  https://kalodimitrov.com/wp-content/themes/kaloyan/images/bgr.jpg
# convert to webp (needs cwebp, or let Claude Code do it with sharp)
cwebp -q 82 public/patterns/bgr.jpg -o public/patterns/bgr.webp

# 3. the CR docs
mkdir -p docs/change-requests
cp ~/Downloads/cr-001-visual.md docs/change-requests/
cp ~/Downloads/cr-001-addendum-and-session.md docs/change-requests/
```

**Photo → slot map** (from CR-10, chosen on measured luminance):

| File | Slot |
|---|---|
| `IMG_9569.JPG` | opener background (B&W, 30% opacity, slow push-in) |
| `IMG_6235.jpg` | about — full-bleed, unfiltered (window into the live room) |
| `IMG_8950.jpg` | contact — VU-meter band |
| `IMG_6681.jpg` | about, secondary (Rhodes + keys) |
| `IMG_6236.jpg` | 404 |

**Rule:** photos go in `src/assets/` (Astro emits responsive AVIF/WebP).
The pattern goes in `public/` (it's referenced from CSS as a tiled background).

---

# PART 3 — CLAUDE CODE SESSIONS

Add to `CLAUDE.md` first:
```markdown
## Active change requests
@docs/change-requests/cr-001-visual.md
@docs/change-requests/cr-001-addendum-and-session.md
CR-001 supersedes the reference implementation wherever they conflict.
Do not redesign anything not listed in CR-001.
```

Create Linear issues KD-6 … KD-9 (one per session) before starting.

---

## SESSION 5 — identity, pattern, assets  (KD-6)
> Read docs/change-requests/cr-001-visual.md and the addendum. Execute CR-1, CR-2,
> CR-3, CR-10, CR-16, plus the audit fixes CR-11, CR-12, CR-13, CR-14, CR-15.
>
> Order: (1) wire the studio photos from src/assets/studio into the opener, about,
> contact and 404 per the photo→slot map, using Astro's Image component with
> responsive AVIF/WebP and preload on the opener image; (2) implement the heritage
> pattern layer per CR-16 — self-hosted, fixed layer not background-attachment,
> seam-safe bottom colour, tint for contrast, applied ONLY to work/about/contacts/404;
> (3) the centered wordmark on the opener (CR-1) with the particle formation landing
> on the same position/size; (4) header wordmark per the DECISION I give you below;
> (5) the audit fixes — 11px meta-text floor, scrim strengthened and verified against
> a sampled BRIGHT frame of cue 03 and cue 04, 44px tap targets, mobile filter row,
> restore the per-cue credits block.
>
> Verify with Chrome DevTools MCP: LCP ≤2.5s on throttled 4G *with the opener photo
> in place*, CLS ≈0, no text under 11px, no tap target under 44px at 390px, no
> pattern seam at 2000px viewport height. Screenshot opener / work / about / contacts
> at 390 and 1440. Comment results on KD-6.

## SESSION 6 — feed audio  (KD-7)
> Execute CR-4. Load background embeds with enablejsapi=1 and control them through
> the YouTube IFrame Player API. Implement the volume control on the home feed:
> unmutes ONLY the cue currently in view; on scroll, crossfade audio between the
> outgoing and incoming cue (~400ms); never more than one audible source; state
> persists in sessionStorage and survives filtering; opening the detail player mutes
> the feed and closing it restores the prior state.
>
> Per the DECISION below, the volume control REPLACES the existing EQ-bars toggle and
> becomes the single sound control for the whole site (feed audio + UI blips).
>
> Verify programmatically, not by ear: assert that at any scroll position at most one
> player reports an unmuted, playing state. Comment on KD-7.

## SESSION 7 — work page: thumbnails, shared filters, gallery  (KD-8)
> Execute CR-5, CR-6, CR-7.
> (1) Extract the filter into ONE shared component consumed by the home feed, the
> work list and the work gallery — no duplicated filter logic anywhere. Reflect
> filter state in the URL (?role=mix) so filtered views are linkable and the back
> button restores them.
> (2) Work list: add a 16:9 thumbnail to each row.
> (3) Gallery view: a list⇄gallery switcher, remembered in sessionStorage. Full-bleed
> responsive grid — 3 up ≥900px, 2 up 600–900px, 1 up <600px, gap ≤8px, no max-width
> container. Tile hover animates: prefer a short muted preview loop; fall back to
> cross-fading two YouTube poster frames (hqdefault + /2.jpg) for a zero-cost animated
> effect. Cap simultaneous hover animations at 2. On mobile, the centred tile
> auto-previews. Each tile: title over a scrim, roles on hover, and a "watch full
> video" action that opens THE SAME player component used from the home feed — do not
> build a second player.
> prefers-reduced-motion and prefers-reduced-data disable previews → static posters.
>
> Verify: no horizontal overflow at any breakpoint; filter parity across all three
> surfaces; ≤2 concurrent previews. Screenshot list and gallery at 390/1440. KD-8.

## SESSION 8 — the player  (KD-9)
> Execute CR-8 and CR-9.
> Replace the native YouTube control bar: load with controls=0, rel=0,
> iv_load_policy=3, enablejsapi=1, playsinline=1, and drive playback entirely through
> the IFrame Player API. Build our own control layer that auto-hides after 2.5s idle
> and returns on pointer move / tap / key: play–pause, rewind 10s, forward 10s, volume
> + mute, scrub bar with elapsed/total, previous cue, next cue, close. Style it in the
> site's language — thin amber playhead (the waveform motif), lowercase micro-labels,
> no icon-pack look. Keyboard: Space, ←/→ (±10s), ↑/↓ volume, M mute, N/P next/prev,
> Esc close, ? shows the shortcut hint.
>
> Presentation (CR-9): letterbox the video to its true aspect (object-fit: contain,
> largest fit), and fill the surround with a blurred, dimmed, scaled copy of the same
> video (~40px blur, ~35% brightness) so the screen reads full without cropping the
> director's frame. Home-feed background loops KEEP cover/crop — they're decorative.
>
> Keep everything behind the VideoSource abstraction: the Vimeo swap must not require
> a redesign. Document in README what changes when Vimeo Pro arrives.
>
> Verify: keyboard-only full playback session; controls auto-hide/return; no frame
> cropping; no letterbox bars visible. KD-9.

## SESSION 9 — regression gate (no new features)
> Run the full CR-001 §G verification: build passes; Chrome DevTools MCP 4G trace
> (LCP ≤2.5s, CLS ≈0, initial JS <80KB gzip); keyboard-only pass at 390 and 1440;
> prefers-reduced-motion pass; the one-audible-source assertion; pattern seam check.
> Then run the Superpowers code-review pass over everything CR-001 touched and fix
> what it finds. Update README. Tag v0.2.

---

# PART 4 — DECISIONS (answer these before Session 5)

Paste your answers into CLAUDE.md so Claude Code doesn't have to ask.

| # | Decision | Options | My recommendation |
|---|---|---|---|
| CR-3 | Header wordmark | (a) centered in header, nav split · (b) two-row header · (c) large centered on load, shrinks to small left mark on scroll | **(c)** — grand logo without permanently eating the video frame |
| CR-4 | Volume icon vs EQ toggle | replace / coexist | **replace** — one sound control, one mental model |
| CR-9 | Player presentation | letterbox + ambient blur fill / true edge-to-edge crop | **letterbox** — cropping cuts off the director's frame |
| CR-10 | Photo colour policy | (a) duotone everything · (b) photos are the one place colour lives | **(b)** — the restraint elsewhere makes the colour land |
| CR-16.5 | Pattern intensity | (a) tinted, subtle ground · (b) near-raw legacy look | **(a)** — legibility; show client both |
| CR-16.6 | Contact section | keep light inversion (no pattern) / drop inversion, sit on pattern + VU band | **drop inversion** — keeps "the room" coherent |

---

# PART 5 — STILL OPEN WITH THE CLIENT
1. His 5–10s opener audio cue → `public/audio/opener-cue.mp3` (loadCueFromFile is
   already wired; it's a drop-in).
2. Vimeo Pro — unlocks full de-branding (CR-8) and progressive MP4s.
3. Real bio, email, phone, socials.
4. Video links for the ~25 projects that currently have none.
5. Featured order of the flagship cues.
6. Sign-off on the four visual decisions above.
