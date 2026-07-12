# GO — executing CR-001
Step-by-step. Follow in order. Total hands-on time before Claude Code takes over: ~25 min.

---

## STEP 1 — Put the files in place (5 min)

```bash
cd ~/dev/kalodimitrov-site

# CR docs
mkdir -p docs/change-requests
cp ~/Downloads/TOKEN-GUARD.md                    docs/change-requests/
cp ~/Downloads/cr-001-visual.md                  docs/change-requests/
cp ~/Downloads/cr-001-addendum-and-session.md    docs/change-requests/

# Studio photos → src/assets (Astro optimises these)
mkdir -p src/assets/studio
cp ~/Documents/FAMILY/MLADEN/kalodimitrov/docs/studio/*.jpg src/assets/studio/
cp ~/Documents/FAMILY/MLADEN/kalodimitrov/docs/studio/*.JPG src/assets/studio/

# Heritage pattern → public (it's a CSS tiled background, not an <img>)
mkdir -p public/patterns
curl -o public/patterns/bgr.jpg \
  https://kalodimitrov.com/wp-content/themes/kaloyan/images/bgr.jpg

git add -A && git commit -m "CR-001: docs, studio photos, heritage pattern asset"
```

✅ Check: `ls src/assets/studio` shows 5 files; `ls public/patterns` shows bgr.jpg.

---

## STEP 2 — Answer the 7 decisions (10 min — THIS IS THE ONLY PART ONLY YOU CAN DO)

Open `CLAUDE.md` and paste this block at the **bottom**. It is pre-filled with my
recommendations — **read each line and change any you disagree with.** Whatever is
in this block is what Claude Code will build, without asking again.

```markdown
## CR-001 DECISIONS (authoritative — do not re-ask)

- **D1 / CR-3 — header wordmark:** (c) large and centered on load, shrinks to a
  small left-aligned mark once the user scrolls past cue 01.
- **D2 / CR-4 — sound control:** the new volume icon REPLACES the EQ-bars toggle.
  One sound control for the whole site: it drives feed audio AND ui blips.
- **D3 / CR-9 — player presentation:** letterbox the video to its true aspect and
  fill the surround with a blurred, dimmed copy of itself. Do NOT crop the frame.
- **D4 / CR-10 — photo colour policy:** photographs are the ONE place colour lives.
  Use IMG_6235 and IMG_6681 unfiltered. Everything else stays on-palette.
- **D5 / CR-16 — pattern intensity:** tinted — the pattern is a subtle ground
  inside the dark system, never a light legacy-style backdrop. Text legibility wins.
- **D6 / CR-16 — contact section:** DROP the light inversion. Contact sits on the
  heritage pattern with the VU-meter photo (IMG_8950) as a band.
- **D7 / pattern colour (see TOKEN-GUARD):** DUOTONE bgr.jpg at build time from
  --color-bg into a low-saturation tint of --color-accent. Do not introduce steel
  blue as a third brand colour. Do not add any new :root colour token.
```

**If you want to overrule me,** the alternatives are:
- D1: (a) centered logo with nav split left/right · (b) two-row header
- D2: keep both toggles
- D3: true edge-to-edge crop (accepts losing the top/bottom of every trailer)
- D4: duotone all photos into the palette
- D5: near-raw pattern, closer to the legacy look
- D6: keep contact light, skip the pattern there
- D7: adopt steel blue-grey as a genuine second brand colour (three-colour system)

---

## STEP 3 — Wire the docs into CLAUDE.md (2 min)

Paste this **above** the decisions block, in the imports section:

```markdown
## Active change requests
@docs/change-requests/TOKEN-GUARD.md          ← READ FIRST. Overrides every literal
                                                colour/font value in the CR docs.
@docs/change-requests/cr-001-visual.md
@docs/change-requests/cr-001-addendum-and-session.md

CR-001 supersedes docs/reference/site-concept-v3.html wherever they conflict.
Do not redesign anything not listed in CR-001.
Do not add or change any :root token without explicit sign-off.
```

Commit.

---

## STEP 4 — Linear issues (2 min, or let Claude Code do it)

Prompt:
> Using the Linear MCP, in team "Denkisa Dev" / project "kalodimitrov.com rebuild",
> create: KD-6 "CR-001 S5 — identity, pattern, assets" · KD-7 "CR-001 S6 — feed audio"
> · KD-8 "CR-001 S7 — work page: thumbnails, filters, gallery" · KD-9 "CR-001 S8 —
> custom player" · KD-10 "CR-001 S9 — regression gate". All Todo, priority High.

---

## STEP 5 — RUN IT

### ▶ THE KICKOFF PROMPT (paste this first, once)

> Read CLAUDE.md, then docs/change-requests/TOKEN-GUARD.md, then
> cr-001-visual.md and cr-001-addendum-and-session.md, in that order.
>
> Critical framing: the live build already carries the correct brand tokens,
> extracted from the legacy site (accent #c99a55 gold/brown, bg #0e0f10, ink
> #c9c9cb, headings #fff, display Agency FB/Bahnschrift, body Verdana). The CR
> documents were written against an earlier concept prototype and their literal
> colour/font values are WRONG. Follow TOKEN-GUARD: use existing tokens, never the
> literals in the CRs, and add no new :root token. Agency FB and Bahnschrift are
> NOT variable fonts — do not use font-variation-settings or animate font weight
> anywhere; get emphasis from size, tracking and colour.
>
> The seven decisions in CLAUDE.md are settled. Do not re-open them.
>
> Before writing any code: (1) take Chrome DevTools MCP screenshots of the current
> opener, home feed, work, about and contacts at 390px and 1440px and save them as
> the visual baseline; (2) give me a short implementation plan for Session 5 only —
> which files you'll touch and in what order. Wait for my go-ahead before editing.

### ▶ SESSION 5 (KD-6) — identity, pattern, assets
> Execute CR-1, CR-2, CR-3, CR-10, CR-16, and the audit fixes CR-11 through CR-15.
> Order: studio photos wired via Astro Image (responsive AVIF/WebP, opener image
> preloaded as LCP) → heritage pattern per CR-16 and D7 (duotoned at build time,
> self-hosted, fixed layer NOT background-attachment:fixed, seam-safe bottom colour,
> applied ONLY to work/about/contacts/404) → centered opener wordmark with the
> particle formation landing on the same position and size → header wordmark per D1
> → audit fixes: 11px computed minimum on meta text, tracking capped at .22em, scrim
> strengthened and verified against a sampled BRIGHT frame of cue 03 and cue 04,
> all tap targets ≥44px, mobile filter row ≤44px tall, per-cue credits restored.
> Contact per D6: no light inversion, pattern + VU band.
> Exit: build passes; DevTools trace on throttled 4G shows LCP ≤2.5s WITH the opener
> photo, CLS ≈0; `git diff src/styles/tokens.css` is empty; grep finds no hardcoded
> hex outside tokens.css; screenshots vs baseline show no unintended palette change.
> Comment on KD-6, mark Done.

### ▶ SESSION 6 (KD-7) — feed audio
> Execute CR-4 per D2. Background embeds get enablejsapi=1; control via the YouTube
> IFrame Player API. Volume control unmutes ONLY the in-view cue; ~400ms crossfade on
> scroll; never more than one audible source; state in sessionStorage, survives
> filtering; opening the player mutes the feed, closing restores. The volume control
> replaces the EQ-bars toggle entirely.
> Exit: assert programmatically that at any scroll position at most one player is
> unmuted AND playing. Comment on KD-7.

### ▶ SESSION 7 (KD-8) — work page
> Execute CR-5, CR-6, CR-7. ONE shared filter component consumed by home feed, work
> list and work gallery — no duplicated filter logic. Filter state in the URL
> (?role=mix), back button restores. Work list gets 16:9 row thumbnails. Gallery:
> list⇄gallery switcher remembered in sessionStorage; full-bleed grid 3-up ≥900px,
> 2-up 600–900px, 1-up <600px, gap ≤8px, no max-width; tile hover animates (prefer a
> short muted loop, fall back to cross-fading two YouTube poster frames); max 2
> concurrent previews; mobile auto-previews the centred tile; each tile has title over
> a scrim, roles on hover, and "watch full video" opening THE SAME player component —
> do not build a second player. reduced-motion/reduced-data → static posters.
> Exit: no horizontal overflow at any breakpoint; filter parity across all three
> surfaces. Screenshots of list and gallery at 390/1440. KD-8.

### ▶ SESSION 8 (KD-9) — the player
> Execute CR-8 and CR-9 per D3. controls=0 + IFrame Player API; custom control layer
> auto-hiding after 2.5s idle: play/pause, ±10s, volume+mute, scrub with elapsed/total,
> prev cue, next cue, close. Styled in the site's language — thin accent playhead,
> lowercase micro-labels. Keyboard: Space, ←/→, ↑/↓, M, N/P, Esc, ? for the hint.
> Presentation: letterbox to true aspect + blurred dimmed self-copy filling the
> surround. Home-feed background loops KEEP cover/crop. Everything stays behind
> VideoSource so the Vimeo swap needs no redesign; document that swap in the README.
> Tell me honestly in your summary which YouTube branding still survives.
> Exit: keyboard-only playback session passes; no frame cropped; no letterbox bars. KD-9.

### ▶ SESSION 9 (KD-10) — regression gate, no new features
> Run CR-001 §G in full: build; DevTools 4G trace (LCP ≤2.5s, CLS ≈0, initial JS
> <80KB gzip); keyboard-only pass at 390 and 1440; prefers-reduced-motion pass; the
> one-audible-source assertion; pattern seam check at 2000px viewport height; token
> diff empty; no stray hexes. Then run the Superpowers code-review pass over
> everything CR-001 touched and fix what it surfaces. Update README. Tag v0.2.
> Post a summary to KD-10 and close the CR-001 epic.

---

## STEP 6 — after each session (yours, 5 min)
1. Look at it yourself at 390px and 1440px. Trust your eyes over the trace.
2. `git diff src/styles/tokens.css` → must be empty.
3. Commit. If a session went sideways, `git reset --hard` beats arguing with it.

## STEP 7 — back to the client
Send the staging URL plus: the two pattern treatments (duotoned vs raw legacy) for
his call, and the still-open list — his opener audio cue, Vimeo Pro, real bio and
contacts, the missing video links, and the featured cue order.
