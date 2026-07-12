# Claude Code kickoff — kalodimitrov.com rebuild

## 0. What you're carrying into the repo

Four artifacts from the concept phase, each with a distinct job:

| File | Role in the repo |
|---|---|
| `kalodimitrov-modernization-spec.md` | The contract. Source of truth for IA, tokens, budgets, a11y, SEO. |
| `phase0-extract.mjs` | Run once against the live site → real tokens + content + redirects. |
| `site-concept-v3.html` | **Reference implementation.** Approved look & behavior. Claude Code ports it into components — never ships it as-is. |
| `extraction/` output (after running the script) | `projects.json` (content source), `brand-report.md` (token values), `redirect-map.csv`. |

## 1. Repo setup (do this by hand, 10 minutes)

```
kalodimitrov-site/
├── CLAUDE.md                  ← from §2 below
├── docs/
│   ├── spec.md                ← the modernization spec
│   └── reference/
│       └── site-concept-v3.html
├── phase0/
│   ├── phase0-extract.mjs
│   └── extraction/            ← script output (run it BEFORE first Claude Code session)
├── src/                       ← Claude Code builds this (Astro)
└── public/
```

Run the extraction first: `node phase0/phase0-extract.mjs --images`.
Then open `extraction/brand-report.md` and paste the real hex values + font names
into the token block in `docs/spec.md` §3. Ten minutes of your judgment here
(which color is bg vs accent) saves Claude Code from guessing.

## 2. CLAUDE.md (paste into repo root, adjust paths if needed)

```markdown
# kalodimitrov.com — portfolio rebuild

Solo sound designer's portfolio. Video-first, sound-first, mobile-first.
Old WordPress site is being replaced by a static Astro build.

## Source of truth
@docs/spec.md

## Content
- Projects come from phase0/extraction/projects.json — never hardcode project data in components.
- Brand tokens (colors, fonts) come from spec §3 (values already extracted from the old site). Never invent colors.

## Reference implementation
docs/reference/site-concept-v3.html is the CLIENT-APPROVED look and behavior:
opener choreography, cue feed layout, filter faders, detail overlay, outro
transition into the hero. Port it — do not import it wholesale. When in doubt
about a visual/timing decision, open this file and match it.

## Stack rules
- Astro, static output. Interactive islands only for: opener canvas, cue feed
  video loader, detail overlay, sound toggle, role filter bar, mobile nav.
  Everything else zero-JS. (Filters and mobile nav were added to this list
  in Session 4 — both are explicitly-requested functional requirements, not
  scope creep; a code-review pass flagged them against the original
  4-island list and this line was stale, not the code.)
- Vanilla CSS with custom properties mirroring spec §3 tokens. No Tailwind.
- No animation libraries. Canvas 2D + Web Audio API for the opener
  (engine already written in the reference file), CSS/WAAPI for the rest.
- TypeScript for islands.

## Hard requirements (non-negotiable, from spec)
- Performance budgets: LCP < 2.5s on 4G, initial JS < 80KB gzip, CLS ≈ 0 (spec §11).
- prefers-reduced-motion: skip opener, no autoplaying loops (spec §12).
- Audio NEVER autoplays without gesture; sound preference persists in sessionStorage.
- Only ONE background video streams at a time (IntersectionObserver pattern
  from the reference file).
- 301 redirects from phase0/extraction/redirect-map.csv must ship with launch (spec §13).
- lowercase text-transform everywhere; the brand voice is lowercase.

## Workflow
- Work in small phases (spec §14). After each phase: `npm run build` must pass,
  then screenshot key pages at 390px and 1440px before moving on.
- Video: YouTube embeds are TEMPORARY (concept parity). Build the video layer
  behind a `VideoSource` abstraction so Vimeo progressive MP4s (spec §11)
  swap in without touching layout.
- Do not edit files in phase0/extraction/ — regenerate via the script.
```

## 3. Session plan — one prompt per phase

**Session 1 — scaffold + silent site (spec Phase 2):**
> Read CLAUDE.md and docs/spec.md. Scaffold the Astro project: token CSS from
> spec §3, layouts and pages for the IA in §8, cue feed rendered from
> phase0/extraction/projects.json with poster images only — no video, no audio,
> no opener yet. Header, filters (visual only ok), about, contact, footer per
> the reference file's layout. Build must pass; show me 390/1440 screenshots.

**Session 2 — video layer (spec Phase 3 + §11):**
> Implement the video layer behind a VideoSource abstraction: background loops
> via IntersectionObserver (one active stream max, ken-burns poster fallback,
> file:// and reduced-motion/reduced-data fallbacks), and the detail overlay
> player with prev/next + keyboard nav. Match docs/reference/site-concept-v3.html
> behavior exactly. YouTube provider first; stub a Vimeo provider.

**Session 3 — opener island (spec Phase 4 + §6):**
> Port the opener from the reference file into an Astro island: choice screen,
> Web Audio cue + analyser-driven canvas, quiet-mode envelope, transparent
> outro into cue 01, skip, replay, sessionStorage once-per-session, reduced-motion
> bypass. Keep the engine code readable — the client's real audio cue will
> replace buildCue() later (add a loadCueFromFile(url) path now).

**Session 4 — hardening (spec Phase 5):**
> Accessibility pass per spec §12, Lighthouse ≥ 90 all categories, meta/OG/schema
> per §13, generate the redirect config for [your host] from redirect-map.csv,
> and a README covering content updates (how to add a project to projects.json).

## 4. Decisions to close with the client (blockers, in order)

1. Token sign-off: confirm the extracted palette/fonts before Session 1 ends.
2. Featured 8–10 projects + their order (currently my guess).
3. Real bio, email, phone, socials, portrait (placeholders are invented).
4. His signature audio cue for the opener + 60–90s showreel.
5. Vimeo Pro account for launch-grade video (YouTube stays for dev).
6. Hosting target (Cloudflare Pages / Netlify / Vercel) — affects redirect format.

## 5. Definition of done (launch gate)

- [ ] All spec §11 budgets green on a throttled 4G Lighthouse run
- [ ] Opener runs with client's real cue; quiet mode identical choreography
- [ ] Every project from projects.json renders; filters and rail correct
- [ ] Vimeo sources live; YouTube provider removed from prod build
- [ ] 301s verified on staging for every old URL
- [ ] Keyboard-only walkthrough passes; reduced-motion walkthrough passes
- [ ] Old WP exported + archived, DNS cutover checklist written


- Superpowers: the spec and session plan already exist (docs/spec.md,
  docs/claude-code-kickoff.md §3). SKIP brainstorming — go straight to plan
  execution. Use TDD only for VideoSource, filters, and redirect generation;
  the canvas opener is verified against docs/reference/site-concept-v3.html.
- After each session: record a Chrome DevTools MCP performance trace of the
  built site on localhost and report LCP / CLS / gzipped JS vs spec §11
  before declaring the session done.


## Active change requests
@docs/change-requests/TOKEN-GUARD.md          ← READ FIRST. Overrides every literal
                                                colour/font value in the CR docs.
@docs/change-requests/cr-001-visual.md
@docs/change-requests/cr-001-addendum-and-session.md

CR-001 supersedes docs/reference/site-concept-v3.html wherever they conflict.
Do not redesign anything not listed in CR-001.
Do not add or change any :root token without explicit sign-off.


## CR-001 DECISIONS (authoritative — do not re-ask)

- **D1 / CR-3 — header wordmark:** (c) large and centered on load, shrinks to medium a
  center-aligned mark once the user scrolls past cue 01, right navigation
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




