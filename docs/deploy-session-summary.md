# kalodimitrov.com — session summary (for continuation)

Covers two related pieces of work: the YouTube→Cloudflare Stream video
migration pipeline (built on the Unraid server) and the cPanel deploy fix
for this repo. Kept scoped to what's relevant to kalodimitrov — unrelated
infra work done in the same session (Hermes Agent updates, an Unraid plugin
diagnosis, a different client's Tailscale-hosted app) is left out; ask if
you want that too.

---

## Part 1 — YouTube → Cloudflare Stream migration (own-channel videos)

Built per `yt-to-cloudflare-stream-brief.md`, a staged pipeline running on
the Unraid server at `/mnt/user/appdata/yt-ingest/` (Dockerized: `yt-dlp` +
`ffmpeg` + `curl` + `jq`, no Python framework). Consolidated into a single
entrypoint: `./ingest.sh [--dry-run|--cleanup]`.

**Rights clearance (Stage 0):** all 10 URLs confirmed cleared by you before
anything was downloaded — mix of Kaloyan's own channel (7 videos: bTV idents,
Audi quattro, BTT talent show promo) plus two Cultures of Resistance Films
documentary trailers and one InvestBulgaria Agency video, all explicitly
approved for re-hosting.

**Result — all 10 videos downloaded, verified (no silent resolution
downgrades, audio/duration checked via `ffprobe`), and uploaded to Cloudflare
Stream, `readyToStream: true` on all:**

| youtube_id | title | channel | cf_uid | playback (HLS) |
|---|---|---|---|---|
| QZXWkp8fNgg | Viktoria | Kaloyan Dimitrov | `c282ffd2a024fdc93162ee64cadf81a7` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/c282ffd2a024fdc93162ee64cadf81a7/manifest/video.m3u8` |
| 0NvrxUucNfg | Burkinabè Rising: the Art of Resistance in Burkina Faso \| Documentary Trailer | Cultures of Resistance Films | `70f0323fc819251c3dbf6b72298f54a2` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/70f0323fc819251c3dbf6b72298f54a2/manifest/video.m3u8` |
| Cn4cgUYuq8Y | Audi quattro \| Hitchhiker | Saatchi & Saatchi Sofia | `4824c450e19ae3ea1d83526e0a6d7a34` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/4824c450e19ae3ea1d83526e0a6d7a34/manifest/video.m3u8` |
| ts99610tUK4 | INVEST IN BULGARIA MOVE TO BE MOVED | InvestBulgaria Agency | `2d5187549e421aa9c8323536783090b6` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/2d5187549e421aa9c8323536783090b6/manifest/video.m3u8` |
| 3xEIA18-rOI | Wantoks: Dance of Resilience in Melanesia \| Documentary Trailer | Cultures of Resistance Films | `c9ca42fedc65142ca7d47e55c2d1160b` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/c9ca42fedc65142ca7d47e55c2d1160b/manifest/video.m3u8` |
| J2ZVs1wAUOQ | BTT TV Talent Show Promo | Kaloyan Dimitrov | `338cc1916a3803c6dcd93b43fe411cc7` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/338cc1916a3803c6dcd93b43fe411cc7/manifest/video.m3u8` |
| D0P-tnd-U3k | bTV Action ID Car | Kaloyan Dimitrov | `e7cf51e8ab68c099b8d7fd0f5a61909f` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/e7cf51e8ab68c099b8d7fd0f5a61909f/manifest/video.m3u8` |
| lpLF86z-KFc | btvComedy The Cool Crew | Kaloyan Dimitrov | `2706b3d1ab80a6e40a8cc88ac376ba36` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/2706b3d1ab80a6e40a8cc88ac376ba36/manifest/video.m3u8` |
| 00jBBv4LEuM | bTV Comedy 2015 IDs Part I | Kaloyan Dimitrov | `dec4416d4cb8b6c7314c7b1134fa382f` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/dec4416d4cb8b6c7314c7b1134fa382f/manifest/video.m3u8` |
| 02O659wiS48 | bTV Action ID Robot | Kaloyan Dimitrov | `96deeddf0efca760f826b6dbbc0a00ac` | `https://customer-a3tdnd25lxjdn49c.cloudflarestream.com/96deeddf0efca760f826b6dbbc0a00ac/manifest/video.m3u8` |

Full data (incl. `cf_thumbnail`, resolution, codec, duration) is in
`manifest.csv` on Unraid at `/mnt/user/appdata/yt-ingest/manifest.csv` —
copy it into this repo if the video provider needs it locally.

**Each video has:** `meta.name` = real YouTube title, `meta.source_url` =
original YouTube URL (provenance), `requireSignedURLs: false`, no scheduled
deletion.

**Cloudflare account setup along the way:**
- Cloudflare Stream had to be **activated on the account** — this was the
  actual root cause of a long stretch of `{"code":1000,"message":"Invalid
  API Token"}` errors on `/user/tokens/verify` across three regenerated
  tokens. Once Stream was enabled, the same token worked immediately for
  the actual Stream API calls (the generic `/user/tokens/verify` endpoint
  still oddly reports the token as invalid even now — appears to be a
  Cloudflare quirk specific to narrowly-scoped tokens; the real functional
  test, hitting the Stream endpoint directly, works fine).
- `.env` at `/mnt/user/appdata/yt-ingest/.env` holds `CF_ACCOUNT_ID` +
  `CF_API_TOKEN` (`Stream:Edit` scope), `chmod 600`.

**Relevant for this repo:** `docs/vimeo-vs-cloudflare-comparison.md` and the
"Cloudflare Stream provider and migration pipeline for own-channel videos"
work already in this repo's history — this manifest is the actual data
those own-channel videos need. The `VideoSource` abstraction (per
`CLAUDE.md` §"Workflow") should be able to consume `cf_playback_hls` +
`cf_thumbnail` directly per project.

**Pipeline is idempotent and reusable** — drop more URLs into
`/mnt/user/appdata/yt-ingest/urls.txt`, run `./ingest.sh --dry-run` first,
then for real. `--cleanup` removes local copies only after Cloudflare
confirms `readyToStream: true`.

---

## Part 2 — cPanel deploy fix (this repo)

1. **Merged `launch-build` → `main` and pushed to GitHub** (`origin/main`
   now current) — `launch-build` had 10 unmerged commits (AVIF poster
   optimization, home-feed changes, CR-003 launch build plan, opener
   build-flag, sound-control nudge) that had never reached `main`, which is
   what cPanel's Git Version Control actually deploys from.
   - Also gitignored `lab/` (122MB of raw opener-cue stems/footage, WIP
     media that never belonged in git history).

2. **Root-caused why "Deploy HEAD Commit" was permanently disabled in
   cPanel:** confirmed via cPanel's own docs that Deploy HEAD Commit
   requires a clean working tree in the server-side git checkout.
   `git status` on the live checkout (`kickstic@jump22`) showed a
   permanently dirty tree: the entire built `dist/` output
   (`index.html`, `about/`, `work/`, `posters/`, `_astro/`, `fonts/`,
   `404.html`, `sitemap*.xml`, etc.) plus Node.js Selector/Passenger
   artifacts (`tmp/`, `.htaccess`, `.user.ini`, `php.ini`, `.prerender/`),
   all untracked.
   - Root cause: `.cpanel.yml` had `REPO_PATH` and `DEPLOYPATH` pointing at
     the **same directory**. Every build copied its own output straight
     into the git working tree, and none of it was gitignored (only
     `dist/` itself was) — so the tree never went clean after the first
     deploy attempt.

3. **Fix applied** (commit `d7b2aef`, pushed): `.cpanel.yml` now separates
   `REPO_PATH` (`/home/kickstic/repositories/kalodimitrov`, outside
   `public_html`) from `DEPLOYPATH` (unchanged:
   `/home/kickstic/public_html/kalodimitrov.com/new/`) — matches what this
   repo's own README already recommended.

4. **Created a new cPanel Git Version Control repo** at the clean path
   (cPanel repo paths can't be edited in place, confirmed via cPanel's
   docs — delete+recreate was the only option). Clone URL is the same
   GitHub repo (`https://github.com/denkisa25/kalod.git`). Confirmed
   healthy: branch `main`, HEAD at `d7b2aef`, no resource usage alerts,
   "includes new deployable changes."

### Current blocker (unresolved as of this summary)

Clicking **Deploy HEAD Commit** in cPanel's UI hangs with no visible output.
`ps aux | grep -E 'npm|node|vite|astro'` immediately after clicking shows
**zero** processes for this build (only unrelated long-running LSNode
processes for a different site, `techno-con.eu`) — meaning the deploy task
is very likely failing near-instantly rather than actually hanging, and
cPanel's UI is just showing a stale "in progress" state on top of a task
that already died silently.

**Next step, was in progress:** run the exact `.cpanel.yml` task sequence
directly via SSH to get real output instead of relying on cPanel's UI:

```bash
export DEPLOYPATH=/home/kickstic/public_html/kalodimitrov.com/new/
export REPO_PATH=/home/kickstic/repositories/kalodimitrov

# run first, watch for where it stalls or errors
/bin/bash $REPO_PATH/deploy.sh

# only run this after deploy.sh completes successfully and dist/ exists
/bin/cp -R $REPO_PATH/dist/. $DEPLOYPATH
```

Likely suspects if `deploy.sh` fails: the hardcoded nodevenv path
(`/home/kickstic/nodevenv/public_html/kalodimitrov.com/new/22/bin/activate`)
not matching the account's actual Node.js Selector app config anymore
(it was set up against the OLD repo path), or the `taskset -c 0,1` /
`VIPS_CONCURRENCY=1` resource pinning misbehaving on a fresh checkout.

### Loose ends / not yet cleaned up

- **Old cPanel repo entry** (pointed at `public_html/kalodimitrov.com/new`
  directly) still needs deleting in cPanel's UI — choose the option that
  does NOT delete files on disk, only stops git tracking. Live site files
  are unaffected either way.
- Local branch `launch-build` is fully merged into `main` — safe to delete
  (`git branch -d launch-build`).
- Local branch `stem-player` has 1 commit not yet pushed to its own
  remote — unrelated to this deploy work, untouched.
