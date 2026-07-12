# kalodimitrov.com — Modernization Specification v1.0

**Client:** Kaloyan Dimitrov — music + sound post (composer, sound designer, mix engineer)
**Current site:** WordPress 6.0.x, custom theme (~2013-era), desktop-only blog-grid layout
**Deliverable:** A sound-first, video-first portfolio site. Design system built in Claude Design; production build in Claude Code.
**Prime directive:** *This is one of the rare websites that should be heard as much as seen.* Every design and engineering decision serves that idea.

---

## 1. Project goals

1. Preserve the client's existing brand character (colors, fonts, lowercase understated tone, "music + sound post" identity) while rebuilding everything around modern full-bleed video and sound.
2. Mobile-first responsive — the current site is desktop-only; the new one must be flawless on phones (where most first impressions from producers/agencies now happen).
3. Video and sound ARE the content. Text is minimal: project title, role tags (mix / music / sound design), client. A pinch of about + contact.
4. A signature audio-reactive opening moment (CleverFranke-style takeover, but driven by Kaloyan's own sound design instead of data bubbles).
5. Fast, accessible, and maintainable by an experienced developer without a heavy CMS if possible.

## 2. Reference DNA (what we borrow from each)

| Reference | What we take | What we skip |
|---|---|---|
| linkaproduction.com | Autoplaying muted MP4 loops as hero + section backgrounds; discipline-based "universe" sections; showreel with runtime label ("Showreel 1:00"); footer as full contact block | Agency plural voice; newsletter |
| depoluxe.xyz | Full-screen video index; numbered project list (I, II, III…) overlaying/alongside video; hover = video preview; extreme text economy ("title" — director — brand pattern → for us: "title" — role — client); Vimeo progressive MP4 delivery behind lightweight WebP posters | Cookie-wall friction; fashion-luxury tone |
| cleverfranke.com | Full-viewport generative opening animation as brand statement before content; the intro *is* the identity | Data-viz bubbles → replaced by an **audio-reactive visual** driven by an actual sound design cue |

## 3. Brand preservation — Phase 0 extraction (do this FIRST)

The visual identity must be lifted from the live site before it's decommissioned. Claude Code task, day one:

- [ ] Crawl kalodimitrov.com; save the active theme CSS and note **exact hex values** for: page background, body text, headings, link color, hover color, the accent used on category tags.
- [ ] Record the **font stack(s)** used for the logo/wordmark "Kaloyan Dimitrov", the "music + sound post" tagline, nav items, and post titles. If they are web fonts, download them; if system/Google fonts, note names + weights. Find the closest variable-font equivalents (variable fonts enable the kinetic-type moments in §7 without extra weight).
- [ ] Screenshot desktop layout at 1440px as the "feel reference" board for Claude Design.
- [ ] Export full media library (`wp-content/uploads`) — thumbnails become fallback posters.
- [ ] Export all posts via WP REST API (`/wp-json/wp/v2/posts?per_page=100&_embed`) → JSON: title, slug, categories (work/mix/music/sound design), embedded video URL (YouTube/Vimeo), featured image, body text.
- [ ] Capture the full URL list for 301 redirect mapping (§13).

Fill these tokens after extraction (placeholders keep the design system unblocked):

```
--color-bg:      #0e0f10;
--color-ink:     #c9c9cb;
--color-heading: #ffffff;
--color-accent:  #1982d1;
--font-display:  'Agency FB', sans-serif;
--font-body:     Verdana, Geneva, sans-serif;
```

Rule: the *values* come from the old site; the *scale, contrast, and application* are new. Same paint, new architecture.

## 4. Content inventory (from live site, July 2026)

- **Identity:** "Kaloyan Dimitrov" / tagline "music + sound post" (lowercase — keep this voice everywhere: nav, labels, buttons).
- **Nav:** about · work · contacts (keep exactly these three, lowercase).
- **Projects:** 31+ on page 1 alone (plus paginated older posts). Notables for the "featured" tier: Viktoria (feature film trailer + teaser — music), BURKINABÈ RISING (documentary trailer), AUDI Quattro "Hitchhiker", INVESTBULGARIA "Move To Be Moved", bTV network package (Talent Show, Action IDs, Comedy rebrand, Master Chef), Pepsi Xmas, Societe Generale, Carlsberg-era TVCs, etc.
- **Role taxonomy (already exists — reuse as filters):** `music` · `mix` · `sound design`. Every project carries 1–3 of these.
- **Clients:** ~25 (Audi, Pepsi, Nestlé, Danone, Carlsberg, Bayer, DDB Sofia, Graffiti BBDO, bTV, Miramar Film, …). Becomes a single quiet marquee/list section — kill the outbound links (link rot, SEO leak).
- **New content needed from client:**
  - [ ] One 45–90s **showreel** (the single most important asset — see Linka's "Showreel 1:00")
  - [ ] 6–10s muted preview loop (or a strong still) per featured project
  - [ ] One 5–10s signature **audio cue** for the opener (his own sound design — ideally with a clear low-end pulse and transient hits, since those drive the visualization)
  - [ ] Short bio (≤120 words) + portrait or studio photo
  - [ ] Preferred contact channels (email, phone, IMDb?, Vimeo?, LinkedIn?)

## 5. Three visual directions (present all three to client)

### Option A — "The Console" (recommended base)
Dark cinematic take on the existing palette. Full-viewport audio-reactive opener (§6) → collapses into a fullscreen showreel hero with the wordmark and a sound toggle. Work is a fullscreen vertical-snap feed of video loops (one project per viewport, Depo Luxe style) with a persistent minimal index (roman or track numbers: 01, 02… like a tracklist/cue sheet). Typography does the branding: oversized project titles vs. tiny role/client meta — the exaggerated-hierarchy contrast currently dominating award-level portfolios. Metaphor language throughout: projects are "cues", the filter bar reads like channel strips (music / mix / sound design), hover states behave like faders.

### Option B — "The Reel" (Linka-inspired, safest)
Muted autoplay showreel fills the hero immediately (no takeover intro). Below: three discipline sections — music / mix / sound design — each with its own looping montage background and a curated 6-project grid. Best if the client is nervous about an experimental opener. Lower engineering risk, still a dramatic leap from the current site.

### Option C — "The Index" (Depo Luxe-inspired, most restrained)
Near-empty screen: wordmark, tagline, and a plain text list of projects. Hovering (desktop) / scrolling (mobile) a title swaps a fullscreen background video behind the list, with a whispered audio preview on hover if sound is enabled. Extremely elegant, extremely fast, but relies on strong preview loops for *every* project.

**Recommendation:** A as the skeleton, B's showreel-as-hero as the post-intro landing state, C's text-index as the "all work" archive view. One coherent site, three moods.

## 6. The signature: audio-reactive opener

This is the CleverFranke moment, translated to sound.

**Concept:** First visit → full-viewport canvas, near-black (site bg token). Center prompt in the display face, lowercase: **"this site is meant to be heard"** with two choices: `enter with sound` / `enter quietly`. This gesture requirement is not a compromise — browsers **block audio autoplay until a user gesture**, so the choice screen is the legally-required tap turned into a brand statement. Every serious sound-studio site does it this way.

**With sound:** his 5–10s signature cue plays; Web Audio API `AnalyserNode` (FFT) drives a generative visual in real time — recommended form: a single elegant **waveform/spectrum line** in the accent color that fractures into particles on transients, then the particles resolve into the wordmark. 2D canvas is sufficient (60fps, tiny bundle); WebGL/three.js only if Option A is chosen and budget allows.
**Quietly:** the same animation runs from a **precomputed amplitude JSON** (offline FFT of the cue, ~2KB) — identical visual, no audio. This also covers `prefers-reduced-motion: no-preference` being false → skip straight to hero with a static wordmark fade.

**Rules:** ≤5s total or skippable on any input; plays once per session (sessionStorage); never on internal navigation; mobile gets the same experience (canvas 2D handles it). Sound preference persists site-wide as a header toggle rendered as a tiny live waveform icon (animated when on, flatlined when off) — the sound toggle is the site's mascot.

**Reusable pattern:** the same analyser drives micro-visualizations elsewhere — a thin reactive line under the video player while a project plays, hover "blips" on nav (≤ -18 LUFS, subtle).

## 7. 2026 trend alignment (deliberate choices, not a checklist)

- **Video-first, full-bleed:** background/preview loops as primary navigation surface (Linka, Depo Luxe pattern; dominant in current award portfolios).
- **Sound as interface:** UI sound design + audio-reactive visuals — literally the client's craft demonstrated by the site itself. Interfaces that react to sound/presence are the emerging "human layer" trend; almost no competitor portfolio does it well.
- **Kinetic / reactive typography:** variable font weight subtly modulated by audio amplitude on the hero wordmark (one place only — restraint).
- **Exaggerated type hierarchy:** huge titles vs. tiny meta labels.
- **Micro-delight:** tactile hover/press states on cards, faders-style filter toggles; every animation has a purpose.
- **Scroll storytelling:** the work feed reveals projects one per viewport with timed title reveals.
- **Dark cinematic mode** as default (matches film/TVC content; only if extracted palette agrees — if the old site is light, offer both and let video posters carry the darkness).
- **Performance + accessibility as trend:** reduced-motion support, keyboard flows, lean pages — now judging criteria, not afterthoughts.
- **MX (machine experience):** clean semantic HTML + schema.org so AI search can read the portfolio (`Person`, `CreativeWork`/`VideoObject` per project).

**Explicitly rejected:** 3D world navigation (Bruno-Simon-style — spectacular but wrong for a client who needs producers to reach the reel in <5 seconds), gamification, collage/maximalism (fights the existing quiet brand), AI-generated imagery (real work only).

## 8. Information architecture

```
/                 opener (first visit) → hero showreel → featured feed (8–10 cues)
                  → about teaser (2 lines) → clients marquee → contact block
/work             full index (Option C list view) + filters: all / music / mix / sound design
/work/{slug}      project: fullscreen video player, title, role tags, client,
                  1–2 sentence credit note, prev/next cue navigation
/about            bio (≤120 words), portrait, selected clients, disciplines
/contacts         email (mailto), phone, socials, location — no form in v1
                  (forms need spam handling; a sound designer's clients email)
404               fun: "silence." + a subtle room-tone visualization + link home
```

Persistent header: wordmark (home) · work · about · contacts · sound toggle. Hamburger only <768px; menu overlay is full-screen with oversized lowercase links.

## 9. Design tokens (Claude Design starting system)

```
Color   --color-bg / -ink / -heading / -accent : {EXTRACT from Phase 0}
        --color-scrim: color-mix(bg 60%, black)        /* text-over-video safety */
        --color-line:  color-mix(ink 20%, transparent)
Type    --font-display: {EXTRACT → closest variable font}
        --font-body:    {EXTRACT}
        Scale (fluid, clamp()): 
        --text-hero:  clamp(2.5rem, 8vw, 7rem)   /* project titles, wordmark */
        --text-h2:    clamp(1.5rem, 3vw, 2.5rem)
        --text-body:  clamp(1rem, 1.1vw, 1.125rem)
        --text-meta:  0.75rem, letter-spacing 0.08em, lowercase  /* role tags */
Space   4px base: 4 / 8 / 16 / 24 / 40 / 64 / 104 / 168 (musical ratio ~1.618 upper steps)
Motion  --ease-out: cubic-bezier(.16,1,.3,1); durations 150 / 300 / 600 / 1200ms
        page transitions: 300ms crossfade; reveals: 600ms rise+fade
Radius  0 (cinematic, full-bleed — no cards with rounded corners)
```

**Component inventory for Claude Design:** header/nav (+ mobile overlay), sound toggle (waveform icon, on/off/playing states), opener screen (choice state, animating state, skip), hero showreel block (muted loop + play-full-reel CTA + runtime label), cue row (fullscreen project section: loop bg, index number, title, tags, scrim), index list item (text row + hover video state), filter bar (fader-style toggles), video player page (16:9 max-height 80vh, custom minimal controls), about block, clients marquee, contact block/footer, 404. Design each at 390px and 1440px.

## 10. Tech stack (Claude Code)

**Recommended: static-first, no WordPress in production.**

- **Framework:** Astro (islands architecture — zero JS by default, hydrate only the opener canvas, video players, and filter bar) or Next.js static export if you prefer React end-to-end. Astro is the better fit: this is a content site with three interactive islands.
- **Content:** projects as Markdown/JSON in the repo (from the Phase 0 WP export). ~35 projects that change a few times a year do not need a CMS; the client emails you a video link and you commit. *(Escape hatch if the client insists on self-editing: keep WP as headless via REST/WPGraphQL and fetch at build time — but propose static first.)*
- **Styling:** vanilla CSS with the token layer (design-system parity with Claude Design), or Tailwind mapped to the same tokens.
- **Animation:** CSS + Web Animations API for reveals; GSAP only if scroll choreography in Option A demands it; Canvas 2D + Web Audio API for the opener (no library needed — `AnalyserNode.getByteFrequencyData` into `requestAnimationFrame`).
- **Hosting:** any static host + CDN (Cloudflare Pages / Netlify / Vercel). Keep the domain, swap DNS at launch.

## 11. Video & audio delivery strategy (the make-or-break section)

- **Full projects:** host on **Vimeo (Pro)** — embed via player on project pages. Depo Luxe uses Vimeo progressive MP4 redirects for its loops; same approach works here and offloads all transcoding/adaptive delivery.
- **Preview loops:** 6–10s, muted, no audio track (`-an`), H.264 + WebM/AV1 sources, 1080p ≤ 2.5MB and 720p ≤ 1.2MB via ffmpeg (`crf 26–28`), `autoplay muted loop playsinline preload="none"` + `poster` (WebP ≤ 60KB). Lazy-load with IntersectionObserver; **pause loops outside viewport**; cap simultaneous playing videos at 2.
- **Mobile/data care:** respect `prefers-reduced-data` and `prefers-reduced-motion` → serve poster stills instead of loops. Offer 720p loop sources under 768px.
- **Audio:** opener cue as 128kbps AAC/opus, ≤ 250KB; UI sounds sprite ≤ 50KB total; everything gated behind the sound preference.
- **Budgets:** LCP < 2.5s on 4G (poster paints first, video enhances), initial JS < 80KB gzipped, CLS ≈ 0 (aspect-ratio boxes on all media), Lighthouse ≥ 90 across the board.

## 12. Accessibility

- Sound never required: every audio-conveyed thing has a visual equivalent (the opener's silent mode is the proof of concept).
- Captions/subtitles available on the showreel and dialogue-bearing work (Vimeo supports VTT).
- Full keyboard navigation incl. the work feed (arrow/tab through cues); visible focus in the accent color; skip-to-content link.
- Contrast ≥ 4.5:1 for meta text over video via the scrim token.
- `prefers-reduced-motion`: no autoplaying loops, no parallax, instant transitions, static opener.
- Semantic landmarks, alt text from project titles, `lang` attributes (site copy is English; note Bulgarian project names render fine — ensure the chosen fonts ship Cyrillic subsets for titles like "Шпек Народен" if original titling is kept anywhere).

## 13. SEO & migration

- 301 map: every old slug (`/viktoria-trailer-2/`, `/burkinabe-rising/`, `/category/work/`, `/about/`, `/contacts/`, `/page/2/`…) → new equivalents. The domain has a decade of authority; don't torch it.
- Per-project meta: OpenGraph video tags, poster as og:image.
- Schema.org: `Person` (Kaloyan) sitewide; `VideoObject` + `CreativeWork` per project with role credits.
- XML sitemap, canonical tags, keep `Kaloyan Dimitrov | music + sound post` title pattern (existing brand equity in that exact phrase).

## 14. Build plan

**Phase 0 (½ day):** brand extraction + WP export + redirect map (§3).
**Phase 1 (Claude Design):** tokens → the 12 components (§9) → three direction mockups (§5) at 390/1440 → client picks → refine chosen direction into full page comps.
**Phase 2 (Claude Code):** scaffold Astro + token CSS → static pages with posters only (no video, no audio) → ship to a staging URL. *A fully working "silent still" site is the safety net.*
**Phase 3:** video layer — loops, players, lazy-loading, budgets (§11).
**Phase 4:** sound layer — opener, toggle, reactive touches (§6).
**Phase 5:** a11y + perf audit, redirects, DNS cutover, keep old WP zipped as archive.

### Prompt starters

**Claude Design:**
> "Design system for a solo sound designer's portfolio (film trailers, TVCs, TV branding). Dark cinematic, full-bleed video-first, lowercase typographic voice. Tokens: [paste §9 with extracted values]. Components: [paste §9 list]. Signature element: an audio-waveform motif used in the sound toggle, opener, and player underline. Reference DNA: Linka (video sections), Depo Luxe (text index over fullscreen video), CleverFranke (takeover intro). Produce the components at 390px and 1440px, then a homepage comp for direction A in §5."

**Claude Code:**
> "Build an Astro static site from this spec [attach file]. Start with Phase 2: token CSS from §9, IA from §8, project content from the attached WP export JSON, posters only. Then implement §11's video loading strategy and §6's opener as isolated islands. Hard requirements: §11 performance budgets, §12 accessibility, §13 redirects."

## 15. Open questions for the client

1. Confirm: keep the exact current palette/fonts, or "same family, slightly refined" acceptable? (e.g., a variable-font sibling of the current typeface)
2. Which 8–10 projects are the featured tier? Which ONE opens the showreel?
3. Can he produce/approve the 5–10s opener cue and a 60–90s showreel? (Blockers for §6 and the hero.)
4. English-only, or English + Bulgarian toggle? (Linka does fr/en; his client base may justify bg/en.)
5. Any new work from 2014–2026 to add? The newest visible project is ~2017 — a modernized site with a decade-old latest credit undercuts the story.
6. Comfort level with the takeover opener (Option A) vs. straight-to-showreel (Option B)?
