# CR-003 — Launch build implementation plan
kalodimitrov.com · author: Mladen (Denkisa Dev) · 2026-09-05 · branch: `launch-build` off `main`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a launch-ready build that opens directly on the 10-cue video feed —
no opener, no sound gate — with the feed muted behind one animated top-right
unmute affordance, every cue served fast, and all 10 videos playing from
Cloudflare Stream.

**Architecture:** Three independent layers, deliberately sequenced so the
client-review link exists before anything blocks on Cloudflare. (1) The opener
becomes a build-time flag rather than deleted code, matching the existing
`SITE_BASE` / `INDEXABLE` pattern in `astro.config.mjs` — one constant, no
forked branch. (2) Posters move out of `public/` into a pre-generated
responsive AVIF set committed to the repo, because the cPanel deploy host
cannot afford build-time image processing (see Global Constraints). (3) The
home feed's 10 cues are re-picked to own-channel work only, so every one of
them can play as a native `<video>` from Cloudflare Stream — which is also the
structural fix for the iOS autoplay failure in
`docs/change-requests/cr-002-mobile-playback-qa.md`.

**Tech Stack:** Astro 7 (static), vanilla TS islands, vanilla CSS with the
tokens in `src/styles/tokens.css`, `sharp` (already present transitively) for
offline asset prep, `node --test` with built-in type stripping for unit tests
(zero new dependencies), Cloudflare Stream via `scripts/upload-to-cloudflare-stream.mjs`.

**Spec:** this document. Supersedes `docs/reference/site-concept-v3.html` and
CR-001 wherever they conflict — specifically, CR-1/CR-2 (opener wordmark and
opener studio photo) do not apply to a build with the opener off.
Companion docs that still bind: `docs/change-requests/TOKEN-GUARD.md`,
`docs/video-migration-guide.md`, `CLAUDE.md`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **TOKEN-GUARD is absolute.** No new or changed `:root` token without sign-off.
  No hardcoded hex outside `src/styles/tokens.css`. Verify per task:
  `git diff --stat -- src/styles/tokens.css` (expect no change) and
  `grep -rInE '#[0-9a-fA-F]{3,8}\b' src --include=*.astro --include=*.ts --include=*.css | grep -v tokens.css`
  (expect empty).
- **Lowercase brand voice** in all UI copy. The wordmark is the only uppercase exception.
- **No new npm dependencies.** `sharp@0.35.3` is already in `node_modules` as an
  Astro transitive dep; `node --test` and TypeScript stripping are built into
  Node 22. Nothing else gets installed.
- **`prefers-reduced-motion: reduce` disables every animation added here**, including
  the unmute pulse. Non-negotiable per `CLAUDE.md`.
- **Audio never plays without a user gesture.** Sound preference persists in
  `sessionStorage` under the existing key `kd-feed-sound`.
- **Only one background video streams at a time** — the existing
  single-active-stream invariant in `initBackgroundLoop()` is not to be relaxed.
- **The cPanel deploy host is resource-capped and this is load-bearing.**
  `deploy.sh` pins the build to `NODE_OPTIONS=--max-old-space-size=700`,
  `VIPS_CONCURRENCY=1`, `taskset -c 0,1`, against a 1.4 GB account memory cap.
  Commits `3906342`, `2b3f643`, `ce13cd3`, `86c44e8`, `53740b5` are the history
  of getting that to work. **Do not add build-time image processing.** Any new
  image variants are generated offline by a script and committed. This is the
  reason Task 4 does not use Astro's `<Image>` component.
- **Performance budgets (spec §11), measured on a throttled 4G + 4x CPU
  Chrome DevTools trace of the built site:** LCP < 2.5s, CLS ≈ 0, initial JS
  < 80 KB gzip. Baseline before this plan: LCP 1.3s, CLS 0.01, JS ~9.8 KB gzip.
- **Build must pass at the end of every task:** `SITE_BASE=/ npm run build`,
  expected `54 page(s) built`.
- **Commit after every task.** Never commit to `main` directly; this plan runs
  on a `launch-build` branch.

## Environment flags after this plan

| Flag | Values | Default | Controls |
|---|---|---|---|
| `SITE_BASE` | `/new`, `/` | `/new` | URL prefix. `/` for Pages and for launch. |
| `INDEXABLE` | `true`, unset | unset | noindex meta + sitemap. `true` only at launch. |
| `OPENER` | `on`, unset | unset (**off**) | Renders the opener island. **New in Task 1.** |

The launch build is `SITE_BASE=/ INDEXABLE=true npm run build`.
The client review build is `SITE_BASE=/ npm run build`.
The old full-opener build is recoverable with `OPENER=on`.

---

## File Structure

**Created**
| File | Responsibility |
|---|---|
| `src/lib/featured.ts` | Pure selection/validation of the home feed's ordered slug list. No I/O. |
| `src/lib/featured.test.ts` | Unit tests for the above. |
| `src/lib/posters.ts` | Turns a slug into `<picture>` srcset strings. Pure apart from the manifest import. |
| `src/lib/posters.test.ts` | Unit tests for srcset construction. |
| `src/data/featured.json` | The 10 home cues, explicit and ordered. Content, not code. |
| `src/data/poster-manifest.json` | Generated. Widths + intrinsic size per slug. |
| `scripts/optimize-posters.mjs` | Offline poster prep. Same convention as `scripts/duotone-pattern.mjs`. |
| `scripts/check-featured.mjs` | Cross-checks `featured.json` against the Stream map. |
| `src/assets/posters/` | Poster **sources**. Never served; input to the script only. |
| `public/posters/opt/` | Generated, served poster variants. |

**Modified**
| File | Change |
|---|---|
| `astro.config.mjs` | Add the `OPENER` flag and its vite define. |
| `src/env.d.ts` | Type `SITE_OPENER`. |
| `src/pages/index.astro` | Gate the opener; `<picture>` posters; conditional auto-arm. |
| `src/components/Header.astro` | Add the `#soundHint` chip beside the toggle. |
| `src/scripts/sound-control.ts` | Track "no explicit choice yet" as `body.sound-unset`. |
| `src/styles/global.css` | Pulse keyframes, hint chip, `picture { display: contents }`. |
| `src/lib/projects.ts` | Resolve posters from the manifest; consume `featured.json`. |
| `src/pages/work/index.astro`, `src/pages/work/[slug].astro` | Use the new poster sources. |
| `src/layouts/BaseLayout.astro` | Swap resource hints from YouTube to Stream. |
| `src/scripts/video-layer.ts` | Retire the touch-only-first-attempt guard. |
| `package.json` | Add `test` and `optimize:posters` scripts. |
| `README.md` | Document the flags, the poster pipeline, and the launch procedure. |

---

## Task 1: Opener behind a build flag

The home page must open directly on cue 01. The opener is not deleted — it is
flag-gated, so the choreography CR-001 signed off on is one env var away and
`git revert` is never the recovery path.

Turning it off has three effects worth knowing before you start: `<Opener />`
stops rendering, so its `<script>` — and with it `opener/index.ts`,
`canvas-engine.ts`, `audio-engine.ts`, `timeline.ts`, `colors.ts` — leaves the
home bundle entirely; the `<link rel="preload" as="image">` for `IMG_9569`
disappears, so **the LCP element becomes cue 01's poster** (which Task 4 then
optimizes); and `BaseLayout` already renders `<body class="ready">` whenever
`hasOpener` is false, so nothing depends on JS to become visible.

**Files:**
- Modify: `astro.config.mjs`
- Modify: `src/env.d.ts`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Produces: `import.meta.env.SITE_OPENER: boolean` — a build-time literal,
  readable from both `.astro` frontmatter and client `<script>` blocks. Task 2
  consumes it to decide whether to call `initAutoArmSound()`.

- [ ] **Step 1: Add the flag to `astro.config.mjs`**

Insert directly after the `INDEXABLE` block:

```js
// WHETHER THIS BUILD SHOWS THE OPENER.
//
// Off by default. The launch direction (CR-003) is that the site opens
// straight onto the cue feed: no choice screen, no sound gate, one unmute
// affordance in the header instead. The opener island is NOT deleted — it is
// CR-001-approved work and this flag is how it comes back:
//
//   OPENER=on npm run build
//
// Same shape as SITE_BASE/INDEXABLE above, and same reason: one constant that
// several derived behaviours read, so a build can never half-happen.
const OPENER = process.env.OPENER === 'on';
```

Then add to the existing `vite.define` object, beside `SITE_INDEXABLE`:

```js
      'import.meta.env.SITE_OPENER': JSON.stringify(OPENER),
```

- [ ] **Step 2: Type the flag in `src/env.d.ts`**

```ts
interface ImportMetaEnv {
  /** Injected by astro.config.mjs via vite.define from the INDEXABLE env var.
   *  False for every build unless explicitly opted in at launch. */
  readonly SITE_INDEXABLE: boolean;
  /** Injected by astro.config.mjs via vite.define from the OPENER env var.
   *  False by default — CR-003 opens the site directly on the cue feed. */
  readonly SITE_OPENER: boolean;
}
```

- [ ] **Step 3: Gate the opener in `src/pages/index.astro`**

In the frontmatter, after the `cueDataJson` line:

```ts
/** CR-003 — off by default; see astro.config.mjs. Read once here so the
 *  three things that depend on it (body.ready, the island itself, the footer
 *  replay button) can never disagree with each other. */
const showOpener: boolean = import.meta.env.SITE_OPENER === true;
```

Change the `<BaseLayout>` opening tag's `hasOpener` prop:

```astro
  hasOpener={showOpener}
```

Replace the `<Footer showReplay />` and `<Opener />` lines with:

```astro
  <Footer showReplay={showOpener} />
  {showOpener && <Opener />}
```

And change the client script block's auto-arm call to be conditional — with the
opener gone there is no "enter with sound" / "enter quietly" choice, so arming
sound on the first stray scroll would put audio on a page the visitor never
asked to hear. Task 2 replaces that with a deliberate click:

```astro
  <script>
    import { initFeedInteractions } from '../scripts/feed-interactions';
    import { initVideoLayer } from '../scripts/video-layer';
    import { initAutoArmSound } from '../scripts/sound-control';
    initFeedInteractions();
    initVideoLayer();
    // CR-003: auto-arm belongs to the opener flow only. Without the opener the
    // header affordance (Task 2) is the single deliberate gesture, so a scroll
    // must not silently turn audio on. Build-time literal — tree-shaken away
    // in the default build.
    if (import.meta.env.SITE_OPENER === true) initAutoArmSound();
  </script>
```

- [ ] **Step 4: Verify the default build has no opener**

```bash
SITE_BASE=/ npm run build
grep -c 'id="opener"' dist/index.html || echo "PASS: no opener in markup"
grep -o '<body class="[^"]*"' dist/index.html
grep -c 'replayOpener' dist/index.html || echo "PASS: no replay button"
```

Expected: the first grep prints `PASS` (exit 1, no match), the body line reads
`<body class="ready"`, the third prints `PASS`.

- [ ] **Step 5: Verify the opener still works when asked for**

```bash
OPENER=on SITE_BASE=/ npm run build
grep -c 'id="opener"' dist/index.html
grep -o '<body class="[^"]*"' dist/index.html || echo "no body class — correct"
```

Expected: first grep prints `1`; the body tag has no `ready` class (the opener
adds it at runtime). Then rebuild the default so `dist/` is not left in the
opener state:

```bash
SITE_BASE=/ npm run build
```

- [ ] **Step 6: Confirm the opener JS actually left the bundle**

```bash
grep -rl "OpenerCanvasEngine\|buildCue" dist/_astro/ || echo "PASS: opener engine not bundled"
du -sh dist/_astro/
```

Expected: `PASS`. If the engine is still bundled, the `{showOpener && ...}`
guard was written as a runtime `hidden` instead of conditional rendering.

- [ ] **Step 7: Commit**

```bash
git add astro.config.mjs src/env.d.ts src/pages/index.astro
git commit -m "$(cat <<'MSG'
Put the opener behind a build flag, off by default

CR-003: the launch build opens directly on the cue feed. The opener island is
CR-001-approved work, so it is gated rather than deleted — OPENER=on restores
it — and the flag follows the SITE_BASE/INDEXABLE pattern already in
astro.config.mjs: one constant, several derived behaviours, no way for a build
to half-happen.

Three consequences worth recording. The island's script no longer renders, so
the canvas/audio/timeline engines leave the home bundle rather than shipping
dead. The opener photo's preload link goes with it, which makes cue 01's poster
the LCP element. And auto-arm-sound-on-first-gesture is now conditional on the
same flag: it existed to soften the opener's explicit sound choice, and without
that choice it would turn audio on during an ordinary scroll.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: Animated unmute affordance in the header

With the opener gone the header sound toggle is the only way into audio, so it
has to ask for the click. It already sits top-right at a 44×44 hit area
(`#soundToggle` desktop, `#soundToggleMobile` mobile) and already drives both
feed audio and UI blips — this task makes it visible, not new.

The state being signalled is specifically **"no explicit choice made yet this
session"**, not "sound is off". Someone who deliberately muted has answered the
question and must not be nagged. `sound-control.ts` already distinguishes these:
`sessionStorage.getItem('kd-feed-sound') === null` means unanswered.

**Files:**
- Modify: `src/scripts/sound-control.ts`
- Modify: `src/components/Header.astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `import.meta.env.SITE_OPENER` from Task 1.
- Produces: `hasExplicitSoundChoice(): boolean` exported from
  `src/scripts/sound-control.ts`; the `body.sound-unset` class contract, which
  is present exactly while no choice has been made.

- [ ] **Step 1: Export the "unanswered" predicate and drive the body class**

In `src/scripts/sound-control.ts`, add after the `isSoundEnabled` export:

```ts
/** CR-003 — has the visitor answered the sound question at all this session?
 *  Distinct from isSoundEnabled(): someone who deliberately muted HAS answered
 *  and must not be nudged again. Without the opener there is no
 *  "enter with sound"/"enter quietly" screen, so the header affordance is the
 *  only place that question ever gets asked. */
export function hasExplicitSoundChoice(): boolean {
  return sessionStorage.getItem(SESSION_KEY) !== null;
}
```

In `setSoundEnabled()`, immediately after the `sessionStorage.setItem(...)` line
— before the `if (enabled === soundEnabled) return;` early return, so that
choosing the value it already had still clears the nudge:

```ts
  document.body.classList.remove('sound-unset');
```

In `initSoundControl()`, after the existing
`document.body.classList.toggle('sound-on', soundEnabled);` line:

```ts
  document.body.classList.toggle('sound-unset', !hasExplicitSoundChoice());
```

- [ ] **Step 2: Add the hint chip to the header**

In `src/components/Header.astro`, inside `<nav class="desktop-nav">`, replace the
`#soundToggle` button with the button plus a chip. The chip is `aria-hidden`
because the button's own `aria-label` already announces the action — a screen
reader user gets no benefit from a duplicate, and the nudge is a visual device:

```astro
    <span id="soundHint" class="sound-hint" aria-hidden="true">sound</span>
    <button id="soundToggle" type="button" aria-pressed="false" aria-label="sound off — unmute" title="sound off — unmute" disabled>
      <span></span><span></span><span></span><span></span><span></span>
    </button>
```

- [ ] **Step 3: Add the styles**

Append to `src/styles/global.css`, in the header section near the existing
`#soundToggle` rules. Tokens only — the pulse is opacity, scale and
`--color-accent`, no new colour:

```css
/* CR-003 — the unmute nudge. Present only while the visitor has made no sound
   choice at all this session (body.sound-unset, set by sound-control.ts).
   With no opener, this is the one moment the site asks to be heard, so it is
   allowed to be conspicuous; it stops permanently on the first answer,
   including an answer of "no". */
@keyframes sound-nudge {
  0%, 100% { transform: scale(1);    opacity: 0.55; }
  50%      { transform: scale(1.16); opacity: 1; }
}
body.sound-unset #soundToggle,
body.sound-unset #soundToggleMobile {
  animation: sound-nudge 2.4s var(--ease-out) infinite;
}
body.sound-unset #soundToggle span,
body.sound-unset #soundToggleMobile span {
  background: var(--color-accent);
}

.sound-hint {
  font-family: var(--font-body);
  font-size: var(--text-meta-size);
  letter-spacing: var(--text-meta-tracking);
  color: var(--color-accent);
  white-space: nowrap;
  opacity: 0;
  transform: translateX(var(--space-2));
  transition: opacity var(--dur-3) var(--ease-out), transform var(--dur-3) var(--ease-out);
  pointer-events: none;
}
body.sound-unset .sound-hint {
  opacity: 1;
  transform: none;
}

/* CLAUDE.md: reduced motion kills the animation, never the affordance. The
   accent-coloured bars and the chip still mark the control as the thing to
   click — they just hold still. */
@media (prefers-reduced-motion: reduce) {
  body.sound-unset #soundToggle,
  body.sound-unset #soundToggleMobile { animation: none; }
  .sound-hint { transition: none; }
}

/* the chip costs horizontal room the mobile header does not have; the mobile
   toggle keeps the pulse and the accent bars on their own */
@media (max-width: 767px) {
  .sound-hint { display: none; }
}
```

- [ ] **Step 4: Verify the nudge appears, and stops on either answer**

```bash
SITE_BASE=/ npm run build && npx astro preview --port 4321 &
```

In the browser at `http://localhost:4321/`:
1. Fresh session (new incognito window) → the top-right EQ bars pulse in accent,
   the word `sound` is visible beside them. **Expected: yes.**
2. Click the toggle → sound turns on, pulse and chip stop. **Expected: yes.**
3. Click it again to mute → pulse stays off. **Expected: yes — the question has
   been answered.** If it starts pulsing again, the `classList.remove` in
   Step 1 landed after the early return instead of before it.
4. Scroll without clicking anything → pulse continues, no audio.
   **Expected: yes** — this is Task 1 Step 3's conditional auto-arm.
5. DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`, reload →
   bars are accent-coloured and still, no pulse. **Expected: yes.**

- [ ] **Step 5: Run the token guard**

```bash
git diff --stat -- src/styles/tokens.css
grep -rInE '#[0-9a-fA-F]{3,8}\b' src --include=*.astro --include=*.ts --include=*.css | grep -v 'tokens.css'
```

Expected: no output from either.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/sound-control.ts src/components/Header.astro src/styles/global.css
git commit -m "$(cat <<'MSG'
Nudge the header sound control while the sound question is unanswered

With the opener flagged off there is no "enter with sound" screen, so the
header toggle is the only place the site can ask to be heard. It now pulses in
accent with a "sound" chip beside it until the visitor answers.

The state signalled is "no choice made this session", not "sound is off" —
someone who deliberately muted has answered, and re-nudging them would be
nagging. sound-control.ts already stored that distinction (the sessionStorage
key is null only while unanswered); this exposes it as body.sound-unset. The
class is cleared before setSoundEnabled's equal-value early return, so choosing
the value that happened to already be set still counts as answering.

Reduced motion drops the animation but keeps the accent colouring and the chip:
the affordance survives, only the movement goes. The chip is hidden under 768px
where the header has no room for it, and is aria-hidden throughout since the
button's own label already announces the action.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: Explicit, own-channel-only featured 10

Today `getFeaturedProjects(10)` takes the 10 most recent `featured: true`
projects by date. That yields 4 cues — `burkinabe-rising`,
`investbulgaria-move-to-be-moved`, `audi-quattro-hitchhiker`,
`wantoks-dance-of-resilience-in-melanesia` — which are uploads on **other
people's** YouTube channels. The client cannot export those from YouTube Studio,
so they can never move to Cloudflare Stream, and they would each keep the iOS
autoplay failure documented in `cr-002-mobile-playback-qa.md` while their
neighbours worked. Making the feed uniformly fast means every cue must be
own-channel.

This also closes a standing open item in `README.md` ("no one's confirmed this
is the right 8–10 or the right order").

**⚠️ Needs client sign-off before Task 6 spends money on uploads.** 18 featured
projects are own-channel, so there is room to choose. The order below is a
proposal: the Sundance-selected feature trailer leads, then the bTV rebrand
package as a block, then the strongest standalone TVCs. **The cost of this
choice is real and should be said out loud to the client:** the four pieces
being dropped are the most recent and arguably the most internationally
recognisable work on the site, and the replacements lean on 2013 Bulgarian TVCs.
They remain on `/work`; this is only about what leads the home feed.

**Files:**
- Create: `src/lib/featured.ts`
- Create: `src/lib/featured.test.ts`
- Create: `src/data/featured.json`
- Create: `scripts/check-featured.mjs`
- Modify: `src/lib/projects.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pickFeatured(order: string[], known: Set<string>, limit: number): string[]`
  — throws on unknown or repeated slugs. `getFeaturedProjects(limit?: number): Project[]`
  keeps its existing signature and return type, so `index.astro` needs no change.

- [ ] **Step 1: Add the test script to `package.json`**

Add to `"scripts"`:

```json
    "test": "node --test --experimental-strip-types \"src/**/*.test.ts\"",
    "optimize:posters": "node scripts/optimize-posters.mjs",
    "check:featured": "node scripts/check-featured.mjs",
```

`--experimental-strip-types` runs TypeScript directly with no transpile step and
no new dependency. It is a no-op on Node 22.18+ where stripping is already the
default, and required at the `>=22.12.0` floor in `engines`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/featured.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFeatured } from './featured.ts';

const known = new Set(['a', 'b', 'c', 'd']);

test('returns the configured order, not the input order of the set', () => {
  assert.deepEqual(pickFeatured(['c', 'a', 'b'], known, 10), ['c', 'a', 'b']);
});

test('truncates to the limit', () => {
  assert.deepEqual(pickFeatured(['a', 'b', 'c'], known, 2), ['a', 'b']);
});

test('throws on a slug that no project provides', () => {
  assert.throws(
    () => pickFeatured(['a', 'nope', 'zilch'], known, 10),
    /unknown slug\(s\): nope, zilch/,
  );
});

test('throws on a repeated slug', () => {
  assert.throws(() => pickFeatured(['a', 'b', 'a'], known, 10), /repeats slug\(s\): a/);
});

test('an empty order is a valid "fall back to the date sort" signal', () => {
  assert.deepEqual(pickFeatured([], known, 10), []);
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module` for `./featured.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/featured.ts`:

```ts
/** CR-003 — the home feed's 10 cues are an explicit, ordered, signed-off list
 *  rather than "the 10 most recent featured: true", for two reasons. The order
 *  is a creative decision nobody had made (a standing README open item), and
 *  every cue must be an own-channel upload so it can be served from Cloudflare
 *  Stream as a native <video> — a third-party-channel cue is stuck on a YouTube
 *  iframe and keeps the iOS autoplay failure in cr-002-mobile-playback-qa.md.
 *
 *  Pure and I/O-free so it can be unit-tested; projects.ts does the wiring. */
export function pickFeatured(order: string[], known: Set<string>, limit: number): string[] {
  const unknown = order.filter((slug) => !known.has(slug));
  if (unknown.length) {
    throw new Error(
      `src/data/featured.json lists unknown slug(s): ${unknown.join(', ')} — ` +
        `every entry must match a slug in phase0/extraction/projects.json`,
    );
  }
  const repeated = [...new Set(order.filter((slug, i) => order.indexOf(slug) !== i))];
  if (repeated.length) {
    throw new Error(`src/data/featured.json repeats slug(s): ${repeated.join(', ')}`);
  }
  return order.slice(0, limit);
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npm test
```

Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 6: Create the ordered list**

Create `src/data/featured.json`. Every slug here is on the client's own YouTube
channel per the 29-video table in `docs/video-migration-guide.md`, which is what
makes Task 6 possible:

```json
{
  "note": "CR-003 — the home cue feed, in order. Every slug MUST be one of the client's own-channel uploads (see the 29-video table in docs/video-migration-guide.md) so it can be served from Cloudflare Stream as a native <video>. A third-party-channel slug here would silently keep the iOS autoplay failure from cr-002-mobile-playback-qa.md. Run `npm run check:featured` after editing. An empty order[] falls back to the old date sort.",
  "order": [
    "viktoria-trailer-2",
    "btv-tv-talent-show",
    "btv-action-id-car",
    "btv-comedy",
    "btv-action-robot",
    "btv-comedy-the-cool-cre",
    "so-independent-ii-2013-promo-trailer",
    "tikves",
    "devin-transparency-tvc",
    "boss-explosion"
  ]
}
```

- [ ] **Step 7: Wire it into `projects.ts`**

Add to the imports at the top of `src/lib/projects.ts`:

```ts
import featuredConfig from '../data/featured.json';
import { pickFeatured } from './featured';
```

Replace the whole `getFeaturedProjects` function with:

```ts
/** CR-003 — an explicit ordered list from src/data/featured.json when one is
 *  configured, otherwise the historical "10 most recent featured: true". The
 *  fallback is kept deliberately: emptying order[] restores the old behaviour
 *  without a code change, which is the cheap way to A/B the feed with the
 *  client. */
export function getFeaturedProjects(limit = 10): Project[] {
  const all = getProjects();
  const order = (featuredConfig as { order: string[] }).order;

  if (order.length > 0) {
    const bySlug = new Map(all.map((p) => [p.slug, p]));
    return pickFeatured(order, new Set(bySlug.keys()), limit).map((slug) => bySlug.get(slug)!);
  }

  return all
    .filter((p) => p.featured)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}
```

- [ ] **Step 8: Add the own-channel cross-check script**

Create `scripts/check-featured.mjs`:

```js
#!/usr/bin/env node
// CR-003 — guards the invariant that every home cue can be served from
// Cloudflare Stream. Advisory while src/data/cloudflare-stream-map.json is
// still empty (Task 6 has not run yet); hard failure once it is populated,
// because at that point a missing slug means a cue silently fell back to a
// YouTube iframe and reintroduced the iOS autoplay failure.
//
//   npm run check:featured
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const { order } = read('src/data/featured.json');
const streamMap = read('src/data/cloudflare-stream-map.json');
const projects = read('phase0/extraction/projects.json');

const knownSlugs = new Set(projects.map((p) => p.slug));
const unknown = order.filter((s) => !knownSlugs.has(s));
if (unknown.length) {
  console.error(`FAIL: featured.json lists slugs no project provides: ${unknown.join(', ')}`);
  process.exit(1);
}

const migrated = order.filter((s) => streamMap[s]);
const notMigrated = order.filter((s) => !streamMap[s]);

console.log(`featured cues: ${order.length}`);
console.log(`on cloudflare stream: ${migrated.length}`);
if (notMigrated.length) console.log(`still on youtube: ${notMigrated.join(', ')}`);

if (Object.keys(streamMap).length === 0) {
  console.log('\nadvisory: cloudflare-stream-map.json is empty — CR-003 task 6 has not run yet.');
  process.exit(0);
}
if (notMigrated.length) {
  console.error(
    `\nFAIL: ${notMigrated.length} home cue(s) are not on Stream. Each one falls back to a` +
      ` YouTube iframe, which does not autoplay on iOS (cr-002-mobile-playback-qa.md).`,
  );
  process.exit(1);
}
console.log('\nPASS: every home cue is served from cloudflare stream.');
```

- [ ] **Step 9: Verify the feed changed and the build still passes**

```bash
npm test
npm run check:featured
SITE_BASE=/ npm run build
grep -o 'cue 0[0-9]' dist/index.html | head -10
node -e "const m=require('fs').readFileSync('dist/index.html','utf8');console.log([...m.matchAll(/<h2>([^<]+)<\/h2>/g)].map(x=>x[1]).slice(0,10).join('\n'))"
```

Expected: 5 tests pass; `check:featured` reports 10 cues, 0 on Stream, the
advisory line, exit 0; build reports `54 page(s) built`; the 10 titles printed
match the order in `featured.json`, starting with `viktoria /trailer/`.

- [ ] **Step 10: Verify the guard actually guards**

```bash
node -e "
const fs=require('fs');const p='src/data/featured.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));const orig=JSON.stringify(j,null,2);
j.order[0]='not-a-real-slug';fs.writeFileSync(p,JSON.stringify(j,null,2));
try{require('child_process').execSync('SITE_BASE=/ npm run build',{stdio:'pipe'});console.log('FAIL: build accepted a bogus slug')}
catch(e){console.log('PASS: build rejected the bogus slug')}
finally{fs.writeFileSync(p,orig+'\n')}
"
SITE_BASE=/ npm run build
```

Expected: `PASS: build rejected the bogus slug`, then a clean rebuild.

- [ ] **Step 11: Commit**

```bash
git add src/lib/featured.ts src/lib/featured.test.ts src/data/featured.json scripts/check-featured.mjs src/lib/projects.ts package.json
git commit -m "$(cat <<'MSG'
Make the home feed an explicit, own-channel-only list of ten

getFeaturedProjects took the ten most recent featured:true projects by date,
which put four third-party-channel uploads on the home feed: burkinabe-rising,
investbulgaria-move-to-be-moved, audi-quattro-hitchhiker and wantoks. The client
cannot export those from YouTube Studio, so they can never move to Cloudflare
Stream, and each would keep the iOS autoplay failure from
cr-002-mobile-playback-qa.md while its neighbours worked. A feed that is fast
and correct on five cues out of ten is not a fast feed.

The ten are now named and ordered in src/data/featured.json, all own-channel per
the migration guide's table. That also settles the "featured order unconfirmed"
open item in the README, which had been outstanding since CR-001. The four
dropped cues stay on /work — this changes what leads the site, not what is on it.

pickFeatured is pure and unit-tested (node --test with built-in type stripping,
no new dependency) and throws on unknown or repeated slugs, so a typo fails the
build rather than silently shortening the feed. An empty order[] restores the
old date sort without a code change, which is how to A/B this with the client.
check-featured.mjs is advisory while the Stream map is empty and hard-fails once
it is populated and a cue is missing from it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: Pre-generated responsive posters

This is the largest single performance win in the plan and it needs no
Cloudflare. The 10 home cues currently ship **9.22 MB** of unoptimized posters
straight out of `public/` — no WebP/AVIF, no `srcset`, no resizing. The worst
offender, `wantoks-…png`, is 4.8 MB; `burkinabe-rising.png` is 1.6 MB. Task 3
removes those two specific files from the feed, but the remaining eight are
still raw PNG/JPEG at full size, and the work list renders 48 of them into
160×90 slots.

Astro's `<Image>` is the obvious tool and is **the wrong one here**: it processes
at build time, and the cPanel deploy host is capped at 700 MB heap /
`VIPS_CONCURRENCY=1` / two pinned cores after a documented run of OOM and
SIGABRT failures. Instead, generate offline and commit the output — the same
approach `scripts/duotone-pattern.mjs` already uses for the heritage pattern.

Format choice: AVIF plus a JPEG fallback, no WebP. AVIF is at ~95% browser
support and materially smaller than WebP; the JPEG covers the rest. Two formats
instead of three keeps the committed set and the `<picture>` markup smaller for
no practical loss.

**Measured before writing this task** — the ten cues in `featured.json`,
converted at the settings below (AVIF q45, resized to 1600w or the source width,
whichever is smaller):

| slug | source | in | out | saved |
|---|---|---|---|---|
| viktoria-trailer-2 | 841×1200 | 81 KB | 36 KB | 56% |
| btv-tv-talent-show | 1920×1080 | 751 KB | 17 KB | 98% |
| btv-action-id-car | 1920×1080 | 834 KB | 27 KB | 97% |
| btv-comedy | 1280×738 | 303 KB | 15 KB | 95% |
| btv-action-robot | 1920×1090 | 508 KB | 18 KB | 97% |
| btv-comedy-the-cool-cre | 1280×738 | 128 KB | 6 KB | 95% |
| so-independent-ii-… | 1280×720 | 903 KB | 21 KB | 98% |
| tikves | 1280×720 | 121 KB | 42 KB | 65% |
| devin-transparency-tvc | 1280×720 | 915 KB | 32 KB | 97% |
| boss-explosion | 1920×1080 | 208 KB | 35 KB | 83% |
| **total** | | **4.64 MB** | **0.24 MB** | **94.8%** |

Every cue improves and none regresses. The shape is consistent rather than
driven by one outlier: the large sources collapse by 95–98%, and the two
weakest results (`viktoria-trailer-2` 56%, `tikves` 65%) are cases where the
source was already small, so there was less to recover. Treat these as the
expected order of magnitude for Step 10's verification, not as a target to
tune toward.

**Defect this measurement exposed — raise with the client.**
`viktoria-trailer-2.jpg` is **841×1200, portrait**, and it is the lead cue of
the home feed, rendered full-bleed into a landscape viewport. At 1440px it is
being upscaled roughly 2× and cropped hard top and bottom. The generator's
never-upscale rule means it correctly gets no 960w or 1600w variant, so this
task makes the file smaller without making it *right*. The real fix is a
landscape still pulled from the trailer itself. Do not let the AVIF conversion
disguise this as solved.

**Files:**
- Create: `scripts/optimize-posters.mjs`
- Create: `src/lib/posters.ts`
- Create: `src/lib/posters.test.ts`
- Create: `src/data/poster-manifest.json` (generated)
- Create: `src/assets/posters/` (moved sources)
- Create: `public/posters/opt/` (generated)
- Modify: `src/lib/projects.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/work/index.astro`
- Modify: `src/pages/work/[slug].astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `srcsetFor(slug: string, widths: number[], ext: string, base: string): string`
  and `posterSources(slug: string): { avif: string; jpeg: string; width: number; height: number }`.
  `Project.poster` keeps its `string` type and now points at the generated
  1280px JPEG, so `og:image` and schema.org `thumbnailUrl` need no change.

- [ ] **Step 1: Move the poster sources out of `public/`**

They stop being served and become inputs. Astro does not emit files in
`src/assets/` unless something imports them, so this removes ~30 MB from every
deploy:

```bash
mkdir -p src/assets/posters
git mv public/posters/*.jpg public/posters/*.png src/assets/posters/
ls src/assets/posters | wc -l   # expect 48
ls public/posters | wc -l       # expect 0
```

- [ ] **Step 2: Write the generator**

Create `scripts/optimize-posters.mjs`:

```js
#!/usr/bin/env node
// CR-003 — offline poster prep. Reads the untouched sources in
// src/assets/posters/ and writes responsive AVIF + a JPEG fallback into
// public/posters/opt/, plus a manifest of what exists at what size.
//
// Deliberately NOT Astro's <Image> component. That processes at build time,
// and the cPanel deploy host runs the build under --max-old-space-size=700,
// VIPS_CONCURRENCY=1 and taskset -c 0,1 against a 1.4GB account cap — see the
// commit history around 3906342/ce13cd3/86c44e8, which is what it took to make
// the build survive thirteen studio photos. Adding 48 posters to that pipeline
// would put it straight back into OOM. Generated output is committed instead,
// which costs repo size and buys a deploy that cannot fail on image processing.
//
// Same convention as scripts/duotone-pattern.mjs. Run when a poster changes:
//   npm run optimize:posters
import sharp from 'sharp';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(ROOT, 'src/assets/posters');
const OUT_DIR = join(ROOT, 'public/posters/opt');
const MANIFEST = join(ROOT, 'src/data/poster-manifest.json');

// 480 covers work-list thumbnails (160px slot at 3x) and gallery tiles;
// 960 covers gallery tiles on wide screens and mobile full-bleed;
// 1600 covers the full-bleed home cue and the project detail still.
const WIDTHS = [480, 960, 1600];
const FALLBACK_WIDTH = 1280;

mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(SRC_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
if (sources.length === 0) throw new Error(`no poster sources in ${SRC_DIR}`);

const manifest = {};
let totalIn = 0;
let totalOut = 0;

for (const file of sources) {
  const slug = basename(file, extname(file));
  const src = join(SRC_DIR, file);
  totalIn += statSync(src).size;

  const meta = await sharp(src).metadata();
  // never upscale — a 640px-wide source has no 1600px variant to offer
  const widths = WIDTHS.filter((w) => w <= meta.width);
  if (widths.length === 0) widths.push(meta.width);

  for (const w of widths) {
    const avif = join(OUT_DIR, `${slug}-${w}.avif`);
    await sharp(src).resize({ width: w }).avif({ quality: 45, effort: 6 }).toFile(avif);
    totalOut += statSync(avif).size;
  }

  const jpeg = join(OUT_DIR, `${slug}-${FALLBACK_WIDTH}.jpg`);
  await sharp(src)
    .resize({ width: Math.min(FALLBACK_WIDTH, meta.width) })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(jpeg);
  totalOut += statSync(jpeg).size;

  manifest[slug] = { widths, width: meta.width, height: meta.height };
  process.stdout.write(`${slug.padEnd(42)} ${widths.join('/')}\n`);
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${sources.length} posters`);
console.log(`sources  ${(totalIn / 1024 / 1024).toFixed(1)} MB  (not served)`);
console.log(`variants ${(totalOut / 1024 / 1024).toFixed(1)} MB  (served)`);
```

- [ ] **Step 3: Run it**

```bash
npm run optimize:posters
```

Expected: 48 lines, then a summary. The sources total should be ~30 MB. Record
the variants figure — Step 10 compares against it.

- [ ] **Step 4: Write the failing test for srcset construction**

Create `src/lib/posters.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcsetFor } from './posters.ts';

test('builds a width-descriptor srcset in the given order', () => {
  assert.equal(
    srcsetFor('btv-comedy', [480, 960], 'avif', ''),
    '/posters/opt/btv-comedy-480.avif 480w, /posters/opt/btv-comedy-960.avif 960w',
  );
});

test('applies a non-root base path to every entry', () => {
  assert.equal(
    srcsetFor('tikves', [480], 'avif', '/new'),
    '/new/posters/opt/tikves-480.avif 480w',
  );
});

test('a single width still gets its descriptor', () => {
  assert.equal(srcsetFor('x', [640], 'avif', ''), '/posters/opt/x-640.avif 640w');
});
```

- [ ] **Step 5: Run it to confirm it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module` for `./posters.ts`.

- [ ] **Step 6: Write `src/lib/posters.ts`**

```ts
import manifest from '../data/poster-manifest.json';

/** CR-003 — posters are pre-generated offline by scripts/optimize-posters.mjs
 *  and committed, not processed by Astro at build time (the cPanel deploy host
 *  cannot afford it; see the script's header). This module is the only place
 *  that knows the generated filename shape. */

export interface PosterEntry {
  widths: number[];
  width: number;
  height: number;
}

const posters = manifest as Record<string, PosterEntry>;

/** Pure — the base is passed in rather than read from import.meta so this is
 *  testable outside a Vite context. */
export function srcsetFor(slug: string, widths: number[], ext: string, base: string): string {
  return widths.map((w) => `${base}/posters/opt/${slug}-${w}.${ext} ${w}w`).join(', ');
}

export interface PosterSources {
  avif: string;
  jpeg: string;
  width: number;
  height: number;
}

export function posterSources(slug: string): PosterSources {
  const entry = posters[slug];
  if (!entry) {
    throw new Error(
      `no poster variants for "${slug}" — add the source to src/assets/posters/ ` +
        `and run: npm run optimize:posters`,
    );
  }
  // NOT withBase('') — that returns '/' at a root base (its `|| '/'` guard
  // catches the empty string), which would emit protocol-relative
  // "//posters/..." URLs pointing at a host called "posters".
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return {
    avif: srcsetFor(slug, entry.widths, 'avif', base),
    jpeg: `${base}/posters/opt/${slug}-1280.jpg`,
    width: entry.width,
    height: entry.height,
  };
}
```

- [ ] **Step 7: Run the test to confirm it passes**

```bash
npm test
```

Expected: `# pass 8`, `# fail 0` (5 from Task 3 plus 3 here).

- [ ] **Step 8: Point `projects.ts` at the manifest**

In `src/lib/projects.ts`, replace the `readdirSync`-based poster resolution. Delete
these lines:

```ts
const postersDir = join(process.cwd(), 'public/posters');
const posterFiles = readdirSync(postersDir);

function resolvePoster(slug: string): string {
  const file = posterFiles.find((f) => f.replace(/\.(jpg|jpeg|png|webp)$/i, '') === slug);
  if (!file) throw new Error(`No poster found for project slug "${slug}"`);
  return `/posters/${file}`;
}
```

and the now-unused imports `readdirSync` and `join`. Replace with:

```ts
/** CR-003 — Project.poster stays a plain path string (og:image and schema.org
 *  thumbnailUrl both need one) and now points at the generated 1280px JPEG
 *  fallback. Anything rendering an actual <picture> calls posterSources(slug)
 *  from ./posters instead. Throwing here keeps a missing variant a build
 *  failure rather than a broken image in production. */
function resolvePoster(slug: string): string {
  if (!posterManifest[slug]) {
    throw new Error(
      `No poster variants for project slug "${slug}" — add the source to ` +
        `src/assets/posters/ and run: npm run optimize:posters`,
    );
  }
  return `/posters/opt/${slug}-1280.jpg`;
}
```

and add to the imports:

```ts
import posterManifest from '../data/poster-manifest.json';
```

- [ ] **Step 9: Render `<picture>` on the home feed**

In `src/pages/index.astro`, add to the frontmatter imports:

```ts
import { posterSources } from '../lib/posters';
```

and, after the `cueDataJson` line, build the lookup once rather than calling
`posterSources()` from inside the template (it throws on a missing slug, and a
frontmatter loop makes that a build error with a clear stack rather than a
mid-render failure):

```ts
const posters = Object.fromEntries(projects.map((p) => [p.slug, posterSources(p.slug)]));
```

Replace the `<img class="poster" ... />` element inside `.bgwrap` with:

```astro
            <picture>
              <source type="image/avif" srcset={posters[p.slug].avif} sizes="100vw" />
              <img
                class="poster"
                src={posters[p.slug].jpeg}
                alt={p.title}
                width="1920"
                height="1080"
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchpriority={i === 0 ? 'high' : 'auto'}
                decoding={i === 0 ? 'sync' : 'async'}
              />
            </picture>
```

Add to `src/styles/global.css`, beside the existing `.cue .poster` rule:

```css
/* CR-003 — <picture> is an inline box that would otherwise sit between .bgwrap
   and the absolutely-positioned .poster and break its containing block.
   display:contents removes it from layout while keeping the source selection. */
.bgwrap picture { display: contents; }
```

- [ ] **Step 10: Verify the payload actually dropped**

```bash
SITE_BASE=/ npm run build
du -sh dist/posters/opt
node -e "
const fs=require('fs');
const html=fs.readFileSync('dist/index.html','utf8');
const first=html.match(/<img class=\"poster\"[^>]*>/)[0];
console.log('first cue img:', first.slice(0,160));
const srcs=[...html.matchAll(/\/posters\/opt\/([a-z0-9-]+)-(\d+)\.avif/g)];
const slugs=[...new Set(srcs.map(m=>m[1]))];
let total=0;
slugs.forEach(s=>{ total += fs.statSync('dist/posters/opt/'+s+'-1600.avif').size; });
console.log('cues on the page:', slugs.length);
console.log('all 10 at 1600w avif:', (total/1024/1024).toFixed(2),'MB  (was 9.22 MB unoptimized)');
console.log('LCP poster (cue 01, 1600w avif):', (fs.statSync('dist/posters/opt/'+slugs[0]+'-1600.avif').size/1024).toFixed(0),'KB');
"
```

Expected: 10 cues; a ten-poster total in the region of **0.24 MB** against
4.64 MB of sources, per the measured table above. The old date-sorted feed
carried 9.22 MB, so the combined effect of Task 3 and this task on home-feed
poster weight is roughly 9.2 MB → 0.25 MB. Confirm `dist/posters/` no longer
contains the 48 originals.

If the total lands far above 0.24 MB, the likely cause is `effort: 6` having
been lowered or the resize step being skipped — check before accepting it.

- [ ] **Step 11: Update the work list, gallery and detail page**

In `src/pages/work/index.astro`, replace the two `<Image src={withBase(p.poster)} ...>`
elements. The `<Image>` component was doing nothing useful here — given a string
src it treats the file as remote and passes it through unoptimized. List row:

```astro
                <img src={posterSources(p.slug).jpeg} srcset={posterSources(p.slug).avif} sizes="160px" alt="" width={160} height={90} loading="lazy" decoding="async" />
```

Gallery tile (keep the existing `frame1` class, which `work-page.ts` selects on):

```astro
              <img class="frame1" src={posterSources(p.slug).jpeg} srcset={posterSources(p.slug).avif} sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw" alt="" width={700} height={394} loading="lazy" decoding="async" />
```

Add `import { posterSources } from '../../lib/posters';` to its frontmatter, and
drop the now-unused `Image` import if nothing else uses it.

In `src/pages/work/[slug].astro`, replace the `.poster-still` img:

```astro
      <img class="poster-still" src={posterSources(project.slug).jpeg} srcset={posterSources(project.slug).avif} sizes="(min-width: 1000px) 1000px, 100vw" alt={project.title} width="1600" height="900" loading="lazy" decoding="async" />
```

with `import { posterSources } from '../../lib/posters';` added to its frontmatter.

- [ ] **Step 12: Verify every page still renders posters**

```bash
SITE_BASE=/ npm run build
npx astro preview --port 4321 &
```

Check in the browser: `/` (10 cues have visible stills), `/work` in list view
(48 thumbnails), `/work` in gallery view (48 tiles, hover cross-fade still
works), `/work/viktoria-trailer-2` (detail still). Then:

```bash
grep -c 'posters/opt' dist/work/index.html
grep -rc 'public/posters/[a-z]' dist/ 2>/dev/null | grep -v ':0' || echo "PASS: no references to the old unoptimized paths"
```

- [ ] **Step 13: Commit**

```bash
git add scripts/optimize-posters.mjs src/lib/posters.ts src/lib/posters.test.ts src/data/poster-manifest.json src/assets/posters public/posters/opt src/lib/projects.ts src/pages/index.astro src/pages/work/index.astro "src/pages/work/[slug].astro" src/styles/global.css package.json
git commit -m "$(cat <<'MSG'
Serve responsive AVIF posters instead of 9 MB of raw PNGs

The ten home cues were shipping 9.22 MB of posters straight out of public/ with
no resizing, no modern format and no srcset — one 4.8 MB PNG among them — and
the work list was scaling 48 full-size originals into 160x90 slots. This is the
largest performance defect on the site and it has nothing to do with video.

Sources move to src/assets/posters/, which Astro does not emit unless something
imports them, so ~30 MB leaves every deploy. scripts/optimize-posters.mjs
generates AVIF at 480/960/1600 plus a 1280 JPEG fallback into public/posters/opt/
and writes a manifest of what exists at what size.

Generated offline and committed rather than built with Astro's <Image>, because
the cPanel deploy host builds under --max-old-space-size=700, VIPS_CONCURRENCY=1
and taskset -c 0,1 against a 1.4 GB cap; the history around 3906342/ce13cd3/
86c44e8 is what it took to get thirteen studio photos through that pipeline, and
48 posters would put it back into OOM. The trade is repo size for a deploy that
cannot fail on image processing.

AVIF plus JPEG, no WebP: AVIF is at ~95% support and beats WebP on size, the
JPEG covers the remainder, and two formats keep both the committed set and the
<picture> markup smaller for no practical loss. Never upscales — a source
narrower than a target width simply has no variant at it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: Verification gate — publish the client review build

No new features. This is where the review link becomes real, and it must happen
before anything blocks on Cloudflare so the client has something to look at
while the video exports are being gathered.

**Files:** none modified except `README.md`.

- [ ] **Step 1: Full local verification**

```bash
npm test
npm run check:featured
SITE_BASE=/ npm run build
git diff --stat -- src/styles/tokens.css
grep -rInE '#[0-9a-fA-F]{3,8}\b' src --include=*.astro --include=*.ts --include=*.css | grep -v 'tokens.css'
```

Expected: 8 tests pass; check-featured exits 0 with its advisory; `54 page(s) built`;
both token-guard commands print nothing.

- [ ] **Step 2: Performance trace against the built site**

```bash
npx astro preview --port 4321
```

With Chrome DevTools MCP: `performance_start_trace` with `reload: true` and
`autoStop: true` against `http://localhost:4321/`, CPU throttling 4x and network
throttling "Slow 4G". Record **LCP, CLS, and total initial JS transfer**.

Budgets (spec §11): LCP < 2.5s, CLS ≈ 0, initial JS < 80 KB gzip.
Baseline to beat: LCP 1.3s, CLS 0.01, ~9.8 KB gzip.

Two changes should move LCP and both should be checked, not assumed: the LCP
element is now cue 01's poster rather than the opener photo, and that poster is
AVIF instead of raw PNG. If LCP regressed, the likely cause is the missing
preload that the opener photo used to have — add
`<link rel="preload" as="image" imagesrcset={...} imagesizes="100vw">` for cue 01
in `BaseLayout` under a `hasVideo` guard before investigating anything else.

- [ ] **Step 3: Accessibility and keyboard pass**

At 390px and 1440px:
- Tab from the top: skip link → wordmark → nav → **sound toggle** → filters →
  rail → cue content. Focus ring visible at every stop.
- The sound toggle is operable with Enter and Space, and announces
  `sound off — unmute` / `sound on — mute` as `aria-pressed` flips.
- No interactive element under 44×44 at 390px (CR-13 standard).
- No rendered text under 11px (CR-11 standard).
- Emulate `prefers-reduced-motion: reduce`: no pulse, no ken-burns, no hover
  previews, no autoplaying loops.

- [ ] **Step 4: One-audible-source assertion**

Scroll the whole feed with sound on, then in the console:

```js
document.querySelectorAll('#feed video, #feed iframe').length
```

and check the feed controller's `debugAudioState()`. Assert at most one player
reports unmuted-and-playing at any scroll position. Open and close the detail
overlay and confirm the feed mutes then restores.

- [ ] **Step 5: Push and confirm the Pages preview**

```bash
git push -u origin launch-build
```

In the Cloudflare dashboard, add `launch-build` to the Pages project's preview
branch include list (Settings → Builds & deployments → Preview deployments →
Custom branches) alongside `stem-player`. Environment variables are already set
project-wide: `NODE_VERSION=22.12.0`, `SITE_BASE=/`. Do **not** set `INDEXABLE`.

Then verify the deployed preview:

```bash
curl -s https://launch-build.kalodimitrov.pages.dev/ | grep -o 'noindex, nofollow'
curl -s https://launch-build.kalodimitrov.pages.dev/ | grep -c 'id="opener"' || echo "PASS: no opener"
curl -so /dev/null -w "%{http_code}\n" https://launch-build.kalodimitrov.pages.dev/sitemap-index.xml
```

Expected: `noindex, nofollow` present, `PASS: no opener`, sitemap `404`.

- [ ] **Step 6: Record the results in the README and commit**

Add a `## CR-003 launch build` section to `README.md` covering: the three env
flags and their launch values, `npm run optimize:posters` as the procedure for
changing a poster, `src/data/featured.json` as the procedure for changing the
home feed, and the measured trace numbers from Step 2.

```bash
git add README.md
git commit -m "$(cat <<'MSG'
Document the CR-003 flags and record the review build's measurements

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
git push
```

**Send the client `https://launch-build.kalodimitrov.pages.dev/`.** Alongside it,
ask for the two things Task 6 is blocked on: sign-off on the ten cues in
`featured.json` (naming the four pieces being dropped from the feed), and the 29
video exports per `docs/video-migration-guide.md` Part 1.

---

## Task 6: Enable Cloudflare Stream and upload the ten

**Blocked on:** the client's 29 YouTube Studio exports (Part 1 of the migration
guide) and sign-off on `featured.json`. Everything before this task ships
without it.

The account exists; Stream billing is not enabled. The upload machinery is
already written and untouched by this plan — `scripts/upload-to-cloudflare-stream.mjs`
uploads, polls for the transcode, requests the downloadable MP4 rendition, and
writes `src/data/cloudflare-stream-map.json`. `resolveVideoRef()` in
`projects.ts` already prefers a slug found in that map over its original YouTube
URL, so **populating the map is the entire code change for this task.**

**Files:**
- Modify: `src/data/cloudflare-stream-map.json` (generated)
- Modify: `.gitignore`

- [ ] **Step 1: Enable Stream and mint a token**

In the Cloudflare dashboard: sidebar → **Stream** → enable. This is where billing
starts — pay-as-you-go, roughly $2–5/month at this project's scale, no separate
signup beyond a payment method. Note the **Account ID** from the Stream dashboard.

Then **My Profile → API Tokens → Create Token → Custom Token**, with
**Stream: Edit** on this account. Copy the token; it is shown once.

- [ ] **Step 2: Put the credentials somewhere that cannot be committed**

```bash
grep -q '^\.env\.local$' .gitignore || echo '.env.local' >> .gitignore
git add .gitignore && git commit -m "Ignore .env.local before any token exists on disk"
cat > .env.local <<'ENV'
CF_ACCOUNT_ID=<account id>
CF_API_TOKEN=<stream:edit token>
ENV
git status --short   # .env.local must NOT appear
```

The `.gitignore` entry is committed **before** the file is created. Reversing
that order is how tokens end up in history.

- [ ] **Step 3: Upload**

Upload all 29 in one pass, not just the ten — the extra 19 cost little, and they
fix the same iOS autoplay problem on `/work` detail pages:

```bash
set -a && source .env.local && set +a
node scripts/upload-to-cloudflare-stream.mjs /path/to/the/29/downloaded/files
```

The script matches each file to a project by filename, so the exports must be
named by slug per the migration guide's table.

- [ ] **Step 4: Verify the map covers every home cue**

```bash
node -e "console.log(Object.keys(require('./src/data/cloudflare-stream-map.json')).length,'slugs mapped')"
npm run check:featured
```

Expected: `check:featured` now hard-fails or passes rather than printing the
advisory. It must print **`PASS: every home cue is served from cloudflare stream.`**
If it names slugs still on YouTube, the corresponding exports were missing or
misnamed — fix the filenames and re-run Step 3 for those.

- [ ] **Step 5: Confirm one MP4 is actually reachable**

```bash
node -e "
const m=require('./src/data/cloudflare-stream-map.json');
const first=Object.values(m)[0];
console.log(first.mp4Url); console.log(first.thumbnailUrl);
"
curl -so /dev/null -w "%{http_code} %{size_download} bytes\n" -r 0-1000 "<the mp4Url printed above>"
```

Expected: `200` with content returned. A `404` means the downloadable rendition
had not finished generating when the script recorded the URL.

- [ ] **Step 6: Commit the map**

```bash
git add src/data/cloudflare-stream-map.json
git commit -m "$(cat <<'MSG'
Map the 29 own-channel videos onto Cloudflare Stream

The upload machinery and the resolveVideoRef override in projects.ts have been
in place since f986290; this populates the map they were waiting for, so it is
data rather than code. Every slug in featured.json is covered, which is what
check-featured.mjs now enforces as a hard failure rather than an advisory.

Each mapped slug switches from a YouTube iframe to a native <video> element.
That is the structural fix for finding 1 in cr-002-mobile-playback-qa.md: iOS
is unreliable about honouring muted autoplay for a cross-origin iframe attached
programmatically by an IntersectionObserver, and reliable about it for a real
<video>.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: Make the feed fast on Stream

With all ten cues on native `<video>`, two YouTube-era workarounds become dead
weight and one becomes actively wrong.

**Files:**
- Modify: `src/scripts/video-layer.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `cloudflare-stream-map.json` populated in Task 6.
- Produces: `BaseLayout` prop `streamHost?: string` — the
  `customer-<code>.cloudflarestream.com` origin to preconnect to.

- [ ] **Step 1: Retire the touch-only-first-attempt guard**

In `src/scripts/video-layer.ts`, `initBackgroundLoop()` currently gives only the
first cue a real attempt on touch devices, because later YouTube iframes
reliably failed and showed YouTube's own paused state. Native `<video>` does not
have that failure mode, and the guard now suppresses working playback.

Delete the `touchOnlyFirstAttempt` / `hasAttemptedOnce` declarations and the
`if (touchOnlyFirstAttempt && hasAttemptedOnce) return;` line in `attach()`, and
replace them with a guard scoped to the actual cause:

```ts
  // Only iframe-backed cues ever had the iOS problem this guards against: iOS
  // is unreliable about muted autoplay for a cross-origin iframe attached
  // programmatically on scroll, and shows YouTube's own paused state when it
  // refuses (cr-002-mobile-playback-qa.md finding 1). A native <video> from
  // Cloudflare Stream autoplays muted on iOS reliably, so it must not be
  // suppressed. Post-CR-003 every home cue is native and this is dormant —
  // it stays for /work detail pages and any un-migrated third-party video.
  const iframeTouchLimit = matchMedia('(pointer: coarse)').matches;
  let iframeAttempted = false;
```

and inside `attach()`, move the check to *after* `spec` is resolved so it can see
the kind — replacing the old early `return`:

```ts
    if (spec.kind === 'iframe') {
      if (iframeTouchLimit && iframeAttempted) return;
      iframeAttempted = true;
    }
```

- [ ] **Step 2: Give the `<video>` elements a poster and an explicit preload**

Still in `attach()`, in the `spec.kind === 'video'` branch, after `v.autoplay = true;`:

```ts
      // the cue's own still, so a slow first segment shows the frame the
      // visitor already sees rather than a black box; and metadata-only
      // preload so an attached-but-not-yet-active cue cannot start pulling
      // video data behind the active one and compete for bandwidth
      const still = cue.querySelector<HTMLImageElement>('img.poster');
      if (still?.currentSrc) v.poster = still.currentSrc;
      v.preload = 'auto';
```

- [ ] **Step 3: Point the resource hints at Stream instead of YouTube**

`BaseLayout` currently preconnects `www.youtube.com` and `i.ytimg.com` and
preloads the IFrame API for any page with `hasVideo`. On a fully-migrated home
feed none of those are used, and preloading an unused script is a wasted request
that Chrome warns about.

In `src/layouts/BaseLayout.astro`, add to `Props`:

```ts
  /** Cloudflare Stream origin (customer-<code>.cloudflarestream.com) to
   *  preconnect to. Passed by pages whose video comes from Stream; when set it
   *  REPLACES the YouTube hints, because preloading an IFrame API that the page
   *  never calls is a wasted request, not free insurance. */
  streamHost?: string;
```

with `streamHost` added to the destructured props, and replace the `hasVideo`
block with:

```astro
  {hasVideo && streamHost && (
    <>
      <link rel="preconnect" href={`https://${streamHost}`} crossorigin />
      <link rel="dns-prefetch" href={`https://${streamHost}`} />
    </>
  )}
  {hasVideo && !streamHost && (
    <>
      <link rel="preconnect" href="https://www.youtube.com" />
      <link rel="dns-prefetch" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      <link rel="dns-prefetch" href="https://i.ytimg.com" />
      <link rel="preload" as="script" href="https://www.youtube.com/iframe_api" />
    </>
  )}
```

- [ ] **Step 4: Derive the host on the home page**

In `src/pages/index.astro` frontmatter, after `const projects = ...`:

```ts
/** Every home cue is on Stream post-CR-003 (enforced by check-featured.mjs), so
 *  derive the origin from the first one rather than hardcoding the customer
 *  code — it is account-specific and would rot silently if duplicated here. */
const streamHost = projects[0].videoRef.cloudflare
  ? new URL(projects[0].videoRef.cloudflare.mp4Url).host
  : undefined;
```

and pass it to `<BaseLayout ... streamHost={streamHost}>`.

- [ ] **Step 5: Verify on a real iOS device**

This is the finding the whole migration exists to fix and it cannot be verified
in a desktop emulator. On an iPhone, against the Pages preview:

- Cue 01 autoplays muted on load. **Expected: yes.**
- Scrolling to cues 02 through 10 autoplays each one muted — no YouTube play
  button, no frozen poster. **Expected: yes.** This is the specific regression
  Step 1 unblocks; before it, only cue 01 ever played.
- Tapping the header sound control unmutes the cue in view; scrolling crossfades
  audio to the next; never two audible at once.

- [ ] **Step 6: Verify the hints and re-run the trace**

```bash
SITE_BASE=/ npm run build
grep -o 'preconnect[^>]*' dist/index.html
grep -c 'youtube.com/iframe_api' dist/index.html || echo "PASS: no unused IFrame API preload"
```

Expected: a preconnect to `customer-<code>.cloudflarestream.com`; `PASS` on the
second. Then repeat the Task 5 Step 2 DevTools trace and compare LCP, CLS and
time-to-first-frame against the numbers recorded there.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/video-layer.ts src/layouts/BaseLayout.astro src/pages/index.astro
git commit -m "$(cat <<'MSG'
Let every cue play now that the feed is native video, not iframes

initBackgroundLoop gave only the first cue a real attempt on touch devices. That
was correct for YouTube — iOS refuses muted autoplay for a cross-origin iframe
attached programmatically on scroll, and shows YouTube's own paused state when
it does, which looks broken (cr-002-mobile-playback-qa.md finding 1). With every
home cue now a native <video> from Stream the failure mode is gone and the guard
was suppressing playback that works, so cues 02-10 never started on iOS.

The guard is not deleted, it is scoped to its actual cause: it now applies only
to iframe-kind embeds, which is dormant on the home feed and still correct for
any un-migrated third-party video elsewhere.

Each <video> also gets the cue's own still as its poster and preload=auto, so a
slow first segment shows the frame the visitor is already looking at.

BaseLayout's resource hints follow the same logic: a page whose video comes from
Stream preconnects to the Stream origin instead of preconnecting to YouTube and
preloading an IFrame API it will never call. The host is derived from the first
cue's mp4Url rather than hardcoded, since the customer code is account-specific.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: Full regression gate

No new features. Everything in CR-001 §G, re-run with CR-003 in place.

- [ ] **Step 1: Automated checks**

```bash
npm test
npm run check:featured
SITE_BASE=/ npm run build
git diff --stat -- src/styles/tokens.css
grep -rInE '#[0-9a-fA-F]{3,8}\b' src --include=*.astro --include=*.ts --include=*.css | grep -v 'tokens.css'
```

Expected: all tests pass; `PASS: every home cue is served from cloudflare stream.`;
`54 page(s) built`; both guard commands silent.

- [ ] **Step 2: Performance trace, throttled**

Chrome DevTools MCP trace against the built preview at Slow 4G + 4x CPU.
Record and compare against Task 5's numbers: **LCP < 2.5s, CLS ≈ 0, initial JS
< 80 KB gzip.** Report the numbers; do not report "budgets met" without them.

- [ ] **Step 3: Keyboard-only pass at 390px and 1440px**

Home feed, work list, work gallery, detail overlay player (Space, ←/→, ↑/↓, M,
N/P, Esc, ?), mobile nav, filters. Focus visible throughout; focus trapped in the
overlay; focus returned to the trigger on close.

- [ ] **Step 4: `prefers-reduced-motion` pass**

No unmute pulse, no gallery hover previews, no autoplaying loops, no ken-burns.
The sound control still works.

- [ ] **Step 5: One-audible-source assertion, whole feed**

Scroll all ten cues with sound on, filter mid-scroll, open and close the detail
overlay. At most one player unmuted-and-playing at every point, verified through
`debugAudioState()` rather than by ear.

- [ ] **Step 6: Pattern and page checks**

`/work`, `/about`, `/contacts`, `/404` still carry the heritage pattern with no
seam at a 2000px viewport height; the home feed and the player stay black.

- [ ] **Step 7: Commit any fixes and tag**

```bash
git commit -am "Fix regressions found in the CR-003 gate"   # only if there are any
git tag v0.3
git push --tags
```

---

## Task 9: Launch flip

**Blocked on:** client sign-off on the review build, plus the launch open items
in `README.md` that are not code — real bio, portrait, phone and socials, and
the brand palette confirmation.

- [ ] **Step 1: Merge to main**

```bash
git checkout main && git merge --no-ff launch-build && git push
```

- [ ] **Step 2: Build for the domain root, indexable**

The two flags are independent by design — "where is it served" and "may it be
found" are different questions — so both are set explicitly:

```bash
SITE_BASE=/ INDEXABLE=true npm run build
```

- [ ] **Step 3: Verify indexing flipped exactly where intended**

```bash
grep -rc 'noindex, nofollow' dist/index.html dist/work/index.html dist/about/index.html || echo "PASS: noindex gone from public pages"
grep -c 'noindex, nofollow' dist/lab/stems/index.html
test -f dist/sitemap-index.xml && echo "PASS: sitemap emitted"
grep -c '/lab/' dist/sitemap-0.xml || echo "PASS: lab excluded from sitemap"
```

Expected: `PASS` on the first; `1` on the second — `/lab/stems` keeps its own
permanent noindex regardless of the flag; `PASS` on the last two.

- [ ] **Step 4: Regenerate the redirects**

```bash
node phase0/generate-htaccess.mjs
```

`.htaccess` is regenerated wholesale on every deploy, so a hand-edited one will
not survive. Every old URL in `phase0/extraction/redirect-map.csv` must 301.

- [ ] **Step 5: Update the cPanel deploy target**

`.cpanel.yml` currently deploys into `.../kalodimitrov.com/new/`. Point
`DEPLOYPATH` and `REPO_PATH` at the real docroot, and add the two env vars to
`deploy.sh`'s build line:

```bash
NODE_OPTIONS="--max-old-space-size=700" SITE_BASE=/ INDEXABLE=true taskset -c 0,1 npm run build
```

Note the nodevenv path in `deploy.sh` is tied to the app rooted at the old
checkout — it must be re-read from cPanel's "Setup Node.js App" page for the new
location, not guessed.

- [ ] **Step 6: Post-cutover verification on the live domain**

```bash
curl -s https://kalodimitrov.com/ | grep -c 'noindex' || echo "PASS: indexable"
curl -so /dev/null -w "%{http_code}\n" https://kalodimitrov.com/sitemap-index.xml
while IFS=, read -r old new; do
  printf "%s -> %s\n" "$old" "$(curl -so /dev/null -w '%{http_code}' "https://kalodimitrov.com$old")"
done < phase0/extraction/redirect-map.csv
```

Expected: `PASS`; sitemap `200`; every old URL `301`.

- [ ] **Step 7: Archive the old site and commit**

Export the WordPress install and archive it before decommissioning. Then:

```bash
git add .cpanel.yml deploy.sh public/.htaccess README.md
git commit -m "$(cat <<'MSG'
Launch: serve from the domain root, indexable

SITE_BASE=/ and INDEXABLE=true are set independently and deliberately — where
the site is served and whether it may be found are different questions, and
coupling them once already meant "serve at root" would have silently
un-noindexed a client preview. /lab/stems keeps its own permanent noindex and
stays out of the sitemap regardless of the flag.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Open items this plan does not close

- **The four dropped cues.** `burkinabe-rising`, `investbulgaria-move-to-be-moved`,
  `audi-quattro-hitchhiker` and `wantoks-…` stay on `/work` as YouTube iframes.
  They keep the iOS background-autoplay limitation on their detail pages. Fixing
  them needs source masters from the production houses, not YouTube Studio.
- **CR-002 stem player.** Parked on the `stem-player` branch, Stage 3 complete.
  Untouched by this plan; `/lab/stems` keeps its permanent noindex through launch.
- **Cloudflare Access on the live domain.** Still blocked on moving DNS to
  Cloudflare. Not required for launch, since launch is deliberately indexable.
- **`viktoria-trailer-2`'s poster is portrait (841×1200)** and leads the home
  feed full-bleed. Needs a landscape still from the trailer; see Task 4.
- **Real bio, portrait, phone, socials; brand palette sign-off; captions/VTT.**
  Content and client decisions, tracked in `README.md`.
