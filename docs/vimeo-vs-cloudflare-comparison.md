# Vimeo vs. Cloudflare Stream — comparison + Vimeo game plan
kalodimitrov.com · contingency planning, 2026-07-15 · client has an active
1-year Vimeo subscription; Cloudflare Stream pipeline is already built
(see docs/video-migration-guide.md) and unused pending this decision.

---

## The one finding that changes the calculus: Vimeo's direct file links expire

Cloudflare Stream's MP4 download URL (what `scripts/upload-to-cloudflare-stream.mjs`
already produces) is a **stable, permanent link** — bake it into the site once,
it works forever.

Vimeo's API is different: the direct/progressive file links it returns carry
a `link_expiration_time` and **expire after a few hours**. That's fine for a
dynamic app that fetches a fresh link per request — it's a real problem for
**this site**, which is a fully static Astro build (`output: 'static'`).
Baking an expiring Vimeo file URL into a static build means the video breaks
a few hours after the last deploy, regardless of how well everything else
works.

This means "native `<video>`, no iframe" (the actual fix for the iOS
autoplay problem — same reason we built it for Cloudflare) is **not a
drop-in option for Vimeo** the way it was for Cloudflare. Two real paths
forward if the client picks Vimeo, not one — see Part 2.

---

## Part 1 — Pros and cons

| | Cloudflare Stream | Vimeo |
|---|---|---|
| **Cost** | ~$2–5/month, new spend | Already paid for 1 year — **$0 marginal cost** this year |
| **Fixes the iOS autoplay bug** | Yes, directly — stable native `<video>` link | Only via Path B below (added complexity) or not at all via the simpler iframe path |
| **De-branding** | Full — it's your own `<video>` tag, no Cloudflare UI at all | Full de-branding needs Vimeo's **mid-tier plan or above** (their cheapest tier can't remove the logo) — need to confirm which tier the client has |
| **Direct file API access** | Included, no tier gate | Requires **Standard/Advanced/Business/Premium** — not the cheapest tier |
| **Analytics** | Developer/API-oriented — no client-friendly dashboard out of the box | Built-in, genuinely nice dashboard the client can check himself without any custom tooling |
| **Engineering already done** | 100% — code from this session works today, just needs the 29 files | `VideoSource`/native-`<video>` adapter architecture is reusable, but the expiring-link problem (above) needs solving first |
| **Ads / third-party UI** | None | None |
| **CDN quality** | Cloudflare's global network — excellent | Vimeo's own CDN — also mature and solid, comparable |
| **Vendor risk** | New, smaller-scale relationship for this use case | Established platform, client already has a relationship/account |

**Bottom line:** if cost were the only factor, Cloudflare wins outright (it's
already built and cheaper). But the client's subscription is a sunk cost —
if he wants to actually use what he's paying for, that's a legitimate,
non-technical reason to prefer Vimeo, as long as everyone understands the
autoplay-fix tradeoff below going in.

---

## Part 2 — Two possible Vimeo implementations, not one

### Path A — Vimeo's iframe player embed (simple, doesn't fully fix the mobile issue)
Use `https://player.vimeo.com/video/{id}` the same way YouTube is used today
— an iframe. No link-expiration problem (the *player* URL doesn't expire,
only raw file links do). Minimal engineering: extend the existing
`VimeoSource` stub in `video-source.ts` (already scaffolded, already
returns `{kind: 'iframe', ...}`) with real autoplay/background-loop
parameters, same shape as `YouTubeSource`.

**Honest tradeoff:** this is still a cross-origin iframe, so it's still
subject to the same *category* of iOS gesture restriction documented in
`cr-002-mobile-playback-qa.md` — Vimeo's player is generally considered
better-behaved than YouTube's for this, but "better-behaved" is not the
same as "fixed." This path does **not** guarantee solving the actual
problem that started this whole investigation.

### Path B — Vimeo direct files through native `<video>` (the real fix, more ops complexity)
Reuses 100% of the `EmbedSpec`/`native-video-player.ts` architecture
already built for Cloudflare this session — a `VimeoDirectSource` would be
a small addition, not a rewrite. The actual new problem is exclusively the
expiring-link issue, solvable one of two ways:

- **B1 — Scheduled rebuilds.** A cron/scheduled job re-triggers the site
  build (and therefore fetches fresh Vimeo file links) on some interval
  shorter than the link's TTL (a few hours) — meaning **rebuilding every
  1–2 hours, every day, indefinitely.** Operationally simple to set up but
  a genuinely unusual, ongoing commitment for what's otherwise a static
  site that rarely changes — and if that scheduled job ever silently
  fails, videos go dead sitewide with no visible warning.
- **B2 — A small dynamic redirect endpoint.** One lightweight
  serverless/edge function (not the whole site — just a tiny endpoint like
  `/api/video/{slug}`) that calls Vimeo's API on each request and 302-
  redirects to the current valid file link. Astro would need to run in
  hybrid/SSR mode for just that one route, or the redirect could live on a
  separate tiny Cloudflare Worker in front of the same domain. More
  correct and no rebuild schedule to babysit, but it's real backend
  infrastructure this project doesn't have today, on a site whose whole
  premise so far (`docs/claude-code-kickoff.md`, `astro.config.mjs`) is
  "static, zero-JS-by-default."

**Cloudflare Stream has neither of these problems** — this is the concrete
cost of Vimeo's architecture for a static site, regardless of which Vimeo
plan tier the client has.

---

## Part 3 — Recommendation, and what to confirm first

Before doing anything: **confirm the client's exact Vimeo plan name/tier** —
it determines whether Path B (or even full de-branding on Path A) is even
possible at all. Vimeo Help Center's "About Vimeo plans" page or the
account's billing page will show this.

If it turns out to be a cheaper tier without direct-file API access, Path A
(iframe) is the *only* option regardless of preference — worth knowing
before promising the client anything.

**My recommendation, in order:**
1. If the tier supports it and the client is comfortable with either B1 or
   B2's added operational piece: **Path B** — it's the only Vimeo option
   that actually fixes the original mobile problem, and most of the code
   is already built.
2. If the client wants something simple now, accepting the iframe
   limitation: **Path A** — quick, safe, no new infrastructure, but flag
   clearly that it's not guaranteed to resolve the iOS autoplay issue,
   just likely to be somewhat better than YouTube.
3. **Cloudflare Stream remains the objectively simplest, cheapest, most
   complete fix** — worth keeping on the table even with the Vimeo
   subscription already paid for, since "already paid for" and "best
   engineering fit" are two different questions and it's fair to let the
   client weigh both with this written down in front of him.

---

## Part 4 — Game plan (Path A or B), once the tier is confirmed

1. Same YouTube Studio export as the Cloudflare plan (`docs/video-migration-guide.md`
   Part 1) — the 29 own-channel videos, unchanged regardless of destination.
2. Vimeo Developer setup: create an app at developer.vimeo.com/apps,
   generate a Personal Access Token with `upload`, `private`, `video_files`
   scopes.
3. `scripts/upload-to-vimeo.mjs` (not yet written — mirrors
   `upload-to-cloudflare-stream.mjs`'s shape): uploads each file via
   Vimeo's resumable (tus) upload API, polls for transcode completion,
   then either stores the plain video ID (Path A) or fetches/refreshes the
   `play.progressive.link` (Path B, subject to the TTL problem above).
4. Code: extend `VimeoSource` in `video-source.ts` — Path A needs only
   embed-URL parameter tuning (same file, small diff); Path B needs a new
   `VimeoDirectSource` returning `{kind: 'video', ...}`, reusing
   `native-video-player.ts` as-is.
5. Testing checklist — same as `video-migration-guide.md`'s, plus (Path B
   only) verifying the refresh mechanism actually keeps links alive past
   the first TTL window before calling it done.
