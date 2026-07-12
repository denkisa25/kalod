# kalodimitrov.com

Kaloyan Dimitrov's portfolio — composer, sound designer, mix engineer. A
static Astro rebuild of the old WordPress site: video-first, sound-first,
mobile-first. See `docs/spec.md` for the full modernization spec and
`docs/claude-code-kickoff.md` for the session-by-session build log this
repo was built from.

## Stack

- **Astro** (`output: 'static'`) — zero JS by default. The only client-side
  code is four small islands: the opener canvas/audio engine, the cue feed's
  background-video loader + detail overlay, the filter bar, and the mobile
  nav.
- **Vanilla CSS**, custom properties in `src/styles/tokens.css`. No Tailwind,
  no CSS framework.
- **TypeScript** for every island (`src/scripts/`).
- No animation library — CSS/Web Animations API for reveals, Canvas 2D + Web
  Audio API for the opener.

## Local development

```bash
npm install
npm run dev       # http://localhost:4321, hot reload
npm run build      # -> dist/
npm run preview    # serves the built dist/ at http://localhost:4321
npx astro check    # typecheck
```

## Deploying (cPanel + Git, not Cloudflare Pages)

This site ships as static files — nothing needs to stay running as a Node
process. The recommended flow uses cPanel's **Git™ Version Control** feature
so the deployed site always tracks a real git history instead of manual
FTP uploads:

1. **Push this repo to GitHub/GitLab** (or wherever you host git). Keep
   `main` as the deployable branch.
2. **In cPanel → Git™ Version Control**, click "Create", point it at your
   repo URL, and set the repository path to something *outside*
   `public_html` (e.g. `~/repo/kalodimitrov`) — you don't want the raw repo,
   `node_modules`, or `phase0/extraction` source data web-accessible.
3. cPanel adds a **post-clone/pull hook** you can edit
   (`~/repo/kalodimitrov/.cpanel.yml` or the deploy script cPanel scaffolds).
   Point it at a script that builds and publishes only `dist/`:

   ```yaml
   # .cpanel.yml at the repo root
   deployment:
     tasks:
       - export DEPLOYPATH=/home/<cpanel-user>/public_html/
       - /bin/cp -R $REPO_PATH/dist/. $DEPLOYPATH
   ```

   cPanel's Git feature only runs the *copy* step automatically — the
   **build** has to happen first. Two ways to handle that:
   - **If cPanel's Node.js version is new enough** (check "Setup Node.js
     App" — Node 20+): add a `node_modules` install + `npm run build` step
     before the copy in a shell script the `.cpanel.yml` task calls, e.g.
     `bash $REPO_PATH/deploy.sh` where `deploy.sh` runs
     `npm ci && npm run build && cp -R dist/. $DEPLOYPATH`.
   - **If not**, build in CI instead (a GitHub Action on push to `main` that
     runs `npm ci && npm run build`, commits `dist/` to a `deploy` branch or
     uploads it as an artifact) and have cPanel's Git feature track that
     branch/deploy via SFTP instead. Either way, **cPanel never needs to run
     a live Node server** — it's serving files Apache already knows how to
     handle.
4. **Redirects and caching ship automatically**: `public/.htaccess` (see
   below) gets copied into `dist/` by Astro's static build, so it lands at
   the `public_html` root with the rest of the site — no separate step.
5. **DNS cutover**: point the domain's A/CNAME at the cPanel host once a
   staging run on the subdomain/path looks right, per spec §14 Phase 5.

### Redirects (`public/.htaccess`)

`phase0/extraction/redirect-map.csv` (from the phase 0 crawl of the old
WordPress site) is the source of truth for every old URL → new URL 301. It's
compiled into `public/.htaccess` — Apache `Redirect 301` directives, since
cPanel hosting runs Apache, not Cloudflare's `_redirects` format.

If the redirect map ever changes (a client tells you an old URL you missed),
edit the CSV and regenerate — never hand-edit `public/.htaccess` directly,
it'll just get overwritten:

```bash
node phase0/generate-htaccess.mjs
```

## Adding a project

Projects render from `phase0/extraction/projects.json` — **never hardcode
project data in a component**. To add or edit one:

1. Open `phase0/extraction/projects.json`. Each entry:

   ```json
   {
     "title": "Project Title",
     "slug": "project-title",
     "old_url": "https://kalodimitrov.com/project-title/",
     "date": "2024-01-01T00:00:00",
     "featured": true,
     "roles": ["music", "mix", "sound-design"],
     "video": "https://www.youtube-nocookie.com/embed/VIDEO_ID?...",
     "poster": "https://kalodimitrov.com/wp-content/uploads/whatever.jpg",
     "excerpt": "One or two sentences about the project."
   }
   ```

   `roles` must be a subset of `["music", "mix", "sound-design"]` — those are
   the only three the filter bar knows about (`ROLE_LABELS` in
   `src/lib/projects.ts`). `featured: true` puts it in the pool for the
   homepage feed; `getFeaturedProjects()` currently takes the 10 most recent
   featured projects — there's no manual ordering field yet. `video` can be
   `null` if there's no video yet — the site handles that gracefully (poster
   only, DetailOverlay shows "video unavailable").

2. **Add the poster image** to `public/posters/<slug>.<ext>` (jpg/jpeg/png/
   webp). `src/lib/projects.ts` resolves the poster at build time by
   matching the filename (minus extension) to the slug — the build **fails
   loudly** if a poster is missing, so you can't ship a broken image link.

3. **Every project needs its own `/work/<slug>/` page** — that's automatic
   (`src/pages/work/[slug].astro` uses `getStaticPaths()` over all
   projects), nothing to do here.

4. Run `npm run build` to confirm it picks up cleanly, then commit both the
   JSON change and the new poster file together.

Client info (`client`) isn't in the WP export — it's hand-mapped in the
`deriveClient()` function in `src/lib/projects.ts` for the handful of
projects where we know it. Add an entry there if you learn a project's
client.

## Swapping YouTube → Vimeo (`VideoSource`)

Every video embed in the site — background loops and the detail-overlay
player — goes through the `VideoSource` interface in
`src/lib/video-source.ts`:

```ts
export interface VideoSource {
  getBackgroundEmbed(ref: VideoRef): string | null; // muted, looping, chromeless
  getPlayerEmbed(ref: VideoRef): string | null;      // full player, autoplay+sound
}
```

`YouTubeSource` is the only one wired up to real content today.
`VimeoSource` already exists with the same interface (same iframe-embed
shape, `background=1&muted=1&autoplay=1&loop=1` for background,
`autoplay=1` for the player) but hasn't been validated against a real Vimeo
Pro account. To cut over once the client's Vimeo Pro account is live:

1. **Update `projects.json`** — change each project's `video` field from a
   YouTube embed URL to a Vimeo one
   (`https://player.vimeo.com/video/<id>?...`). `parseVideoUrl()` in
   `video-source.ts` already recognizes both formats and routes to the
   right provider automatically — **no code change needed** for projects
   that already have a Vimeo URL.
2. **Spot-check `VimeoSource`** against a real embed once you have
   credentials — Vimeo Pro's actual embed parameters (privacy settings,
   domain-restriction tokens) may need small adjustments to the query
   string `VimeoSource.getBackgroundEmbed`/`getPlayerEmbed` build. This is
   the one part of the swap that needs a live test, not just a code change.
2a. **CR-8's custom player controls (`player-controls.ts`) are wired against
   the YouTube IFrame Player API (`lib/youtube-api.ts` — `YT.Player`,
   `mute`/`unMute`/`setVolume`/`seekTo`/`getCurrentTime`/`getDuration`/
   `getPlayerState`).** Vimeo's equivalent is the `@vimeo/player` SDK
   (`Player` class), whose method names differ slightly (e.g. `getDuration()`
   returns a Promise, not a synchronous number) and which uses real DOM
   events (`play`, `pause`, `timeupdate`, `volumechange`) instead of polling
   `getPlayerState()` every frame. Swapping providers means adding a small
   `VimeoPlayerAdapter` that implements the same `YTPlayer`-shaped interface
   `player-controls.ts` already consumes (so that file itself doesn't need
   to change), not calling the Vimeo SDK directly from the controls code.
2b. **CR-9's ambient background layer reuses `getBackgroundEmbed()`** (muted,
   looping) for the blurred surround — `VimeoSource.getBackgroundEmbed`
   already returns a matching muted/looping embed, so this specific piece
   needs no new code, only the spot-check in step 2 above.
2c. **`getPreviewFrames()` (CR-7's gallery hover cross-fade) has no Vimeo
   implementation** — `VimeoSource.getPreviewFrames()` returns `null` today,
   which falls back to the static poster (no crash, just no hover
   animation for Vimeo-sourced tiles). Vimeo's oEmbed API can return a
   `thumbnail_url`, but not two *distinct* frames the way YouTube's
   `hqdefault.jpg`/`2.jpg` do — getting a second frame would mean either
   accepting a single still (no cross-fade) or switching that tile to the
   real muted-preview-loop option CR-7 lists as the preferred approach,
   which Vimeo Pro's progressive MP4s make cheap (no separate embed
   needed, just a `<video>` tag pointed at the direct file).
3. Once every project is on Vimeo, delete `YouTubeSource` from
   `video-source.ts` and the `getVideoSource()` provider map — the
   `VideoSource` interface and every call site stay exactly the same, only
   the concrete implementation goes away. Per spec §14/definition-of-done,
   the YouTube provider should not ship in the production build.
4. Preview loops (spec §11: 6–10s, muted, H.264+WebM/AV1, ffmpeg-compressed,
   posters as WebP ≤60KB) are Vimeo Pro's progressive-MP4 delivery — that
   part is entirely on Vimeo's side once the account and uploads are in
   place; no code here builds or hosts those files.

## Dropping in the real opener cue

The opener (`src/scripts/opener/`) currently runs `buildCue()` — a
synthesized placeholder (thumps/riser/hits/drop, tuned to the exact timeline
in `src/scripts/opener/timeline.ts`). Once the client delivers his real 5–10s
signature cue:

1. **Encode it** as an MP3 (or anything `AudioContext.decodeAudioData` can
   handle — MP3/AAC/WAV all work) and drop it at
   **`public/audio/opener-cue.mp3`**. That exact path is hardcoded as
   `CUE_FILE_URL` in `src/scripts/opener/index.ts`.
2. **That's it for wiring** — `initOpener()` already probes for that file on
   every page load (`decodeCueFile()`) and prefers it over `buildCue()`
   automatically:
   - **"enter with sound"**: plays the real file through the same
     `AnalyserNode` the synth used, so the waveform/particles react to the
     actual cue's live frequency data instead of the synthetic envelope.
   - **"enter quietly"**: never plays audio, but now derives the amplitude
     envelope by analyzing the real file's waveform offline
     (`deriveEnvelope()`) instead of the hand-tuned approximation —
     the silent visual will actually match the real cue's dynamics.
   - If the fetch 404s (file not present), it silently falls back to
     `buildCue()` — this is why the build currently shows one expected
     console 404 for that path; it's not a bug, it's the fallback working
     as designed.
3. **Retime the choreography.** This is the one manual step: `timeline.ts`'s
   `T` constants (`thumps: [600, 1300]`, `riser: [2000, 4600]`,
   `hits: [2600, 3300, 3900]`, `drop: 4600`, `outro: 6200`, `end: 7600`,
   all in milliseconds from the moment playback starts) are hand-tuned to
   the *synthetic* cue's specific hits. The real cue's actual transients
   will land at different times. Listen to the real cue, note where its
   thumps/hits/drop actually are, and update `T` to match — otherwise the
   flash/particle-burst/wordmark-formation will fire out of sync with the
   real audio.
4. Also update the **60–90s showreel** the hero references, and get the
   client's sign-off on the featured-project order (currently just "10 most
   recent `featured: true`" — see "Open items" below).

## Open items before launch

Carried over from `docs/claude-code-kickoff.md` §4 and the spec's open
questions (§15) — things this build can't resolve on its own:

- [ ] **Brand palette sign-off.** The accent moved from the phase0-extracted
      blue (`#1982d1`) to a gold (`#c99a55`) per `docs/design/README.md`
      (v3 pass) — that gold is a design judgment call, not a live-site
      extraction. Confirm with the client before launch.
- [ ] **Featured project selection + order.** Home page currently shows the
      10 most recent `featured: true` projects; no one's confirmed this is
      the right 8–10 or the right order.
- [ ] **Real bio, portrait, phone, socials.** `/about` and `/contacts` still
      have placeholder copy and a placeholder portrait block.
- [ ] **Vimeo Pro account** — see "Swapping YouTube → Vimeo" above.
- [ ] **Real opener cue + showreel** — see "Dropping in the real opener
      cue" above.
- [ ] **Captions/VTT** for dialogue-bearing work (spec §12) — deferred until
      the Vimeo cutover, since Vimeo surfaces VTT tracks through its own
      player chrome and none of today's YouTube embeds carry
      client-authored captions.
- [ ] **Old WordPress export + DNS cutover checklist** (spec §14 Phase 5) —
      not part of this repo; handle alongside the actual DNS change.

## Performance & accessibility budgets (spec §11/§12)

Re-verified after CR-001 (Session 9 regression gate) via a throttled (Slow
4G, 4x CPU) Chrome DevTools trace on the built site: homepage LCP 1.3s
(budget: <2.5s, opener photo in place), CLS 0.01 (budget: ≈0), total home-page
JS ~9.8KB gzip (budget: <80KB). Re-run `npx astro build && npx astro preview`
plus a Chrome DevTools MCP trace (or Lighthouse in Chrome DevTools directly)
after any change that touches images, fonts, or the opener/video islands,
since those are what the budgets are actually protecting.

## CR-001 regression gate (Session 9)

A multi-angle code-review pass (correctness × 3, cleanup × 3, altitude,
CLAUDE.md conventions) ran against the full CR-001 diff before tagging v0.2.
Real, confirmed issues found and fixed:

- **Focus trap bypass**: the detail overlay's keydown handler skipped
  `trapTabKey()` whenever focus was on the new volume slider, letting Tab
  escape the modal.
- **`#detail`'s background had drifted to a literal `#000`** instead of
  `var(--color-bg)` during the CR-8/CR-9 rewrite — a TOKEN-GUARD violation.
- **Work-list rows were accidentally wired to open the video modal**
  instead of navigating to the project's detail page (a side effect of
  adding thumbnails in Session 7) — reverted to plain navigation; only the
  gallery's dedicated "watch full video" link opens the modal, per CR-7.
- **Vimeo-sourced cues rendered a fully non-functional custom control
  bar** (CR-8's transport is only wired to YouTube's IFrame API) — now
  hidden for non-YouTube providers, leaving Vimeo's own native controls as
  the working UI until the real Vimeo cutover.
- **The hero header state hid the mobile hamburger menu entirely**,
  leaving mobile visitors with no way to reach navigation until they
  scrolled past all of cue 01 — `#navToggle` now stays reachable through
  the hero state; only the nav links and the mobile sound toggle fade.
- **The same `[hidden]`-attribute-vs-unconditional-`display` bug had been
  independently patched four times** (`.feed-empty`, `.shortcut-hint`,
  `.work-list`, `.work-gallery`) rather than fixed once — consolidated into
  a single `[hidden] { display: none !important; }` rule in the reset
  layer so no future component can reintroduce it.
- Two feed-audio races: `makeAudible()` used to mark the new cue audible
  *before* confirming its player actually unmuted, stranding the previous
  cue's audio forever if that call threw; and both `makeAudible()`'s and
  `detach()`'s fade-outs assumed the outgoing player was always at volume
  100 rather than reading its actual current volume.
