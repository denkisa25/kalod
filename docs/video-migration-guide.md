# Video migration guide — YouTube → Cloudflare Stream
kalodimitrov.com · 29 own-channel videos · 2026-07-14

Scope: the 29 videos hosted on the client's own YouTube channel ("Kaloyan
Dimitrov"). The other 14 third-party-channel videos and 2 already-broken
ones (`pepsi-xmas`, `societe-saving`) are explicitly out of scope for this
pass — see `docs/change-requests/cr-002-mobile-playback-qa.md` and the
session notes for that classification.

---

## Part 1 — Export the 29 videos from YouTube Studio (client does this)

YouTube Studio's official export is **per-video, not a true bulk action** —
there's no single "select 29, click download once" button. It's still the
right way to do this: it's the *official*, ToS-compliant path (vs. an
unofficial scraping tool), and it returns close to the original uploaded
quality, not a re-compressed copy.

**Steps, repeated once per video below:**
1. Sign in to [studio.youtube.com](https://studio.youtube.com) with the
   "Kaloyan Dimitrov" channel.
2. Click **Content** in the left sidebar.
3. Find the video (search by title — list below).
4. Click the **⋮** (more options) icon on that video's row → **Download**.
5. Save the file using the **slug** below as the filename (e.g.
   `viktoria-trailer-2.mp4`) — this is what lets the upload script match
   each file back to the right project automatically. Put all 29 files in
   one folder.

**The 29 videos** (slug — use as filename — | video title to search for in Studio):

| Filename (slug) | Search for this title in Studio |
|---|---|
| `viktoria-trailer-2` | Viktoria /Trailer/ |
| `btv-tv-talent-show` | bTV Talent Show |
| `btv-action-id-car` | bTV Action ID Car |
| `btv-comedy-the-cool-cre` | bTV Comedy The Cool Crew |
| `btv-comedy` | bTV Comedy Rebrand |
| `btv-action-robot` | bTV Action ID Robot |
| `so-independent-ii-2013-promo-trailer` | So Independent II |
| `tikves` | Tikvesh Wines TVC |
| `boss-explosion` | Boss Explosion TVC |
| `a-presidential-campaign-tvc-2` | A Presidential Campaign |
| `bella-tocheni` | Bella Tocheni TVC |
| `devin-transparency-tvc` | Devin Transparency TVC |
| `pirinsko-radler` | Pirinsko Radler TVC |
| `the-bow` | The Bow TVC |
| `so-independent-i` | So Independent I |
| `hyundai_we` | Hyundai Web |
| `mocca-mocc` | MyMotto TVC |
| `mtel-comfort` | Mtel Comfort TVC |
| `handy-nokia-lumia-tvc` | Handy Nokia Lumia TVC |
| `lunch-break-clip-1` | Lunch Break Clip 1 |
| `lunch-break-finale` | Lunch Break Clip 2 |
| `kubeti-cubes` | Kubeti Cubes TVC |
| `hope-for-the-little-ones` | Hope For The Little Ones Campaign TVC |
| `loop-after9` | Loop After 9pm TVC |
| `handy-vtora-mladost-tvc` | Handy Vtora Mladost TVC |
| `the-clockmaker` | The Clockmaker TVC |
| `project-title-one` | Mtel Vodafone Live TVC |
| `o-leki-tvc` | O Leki TVC |
| `loop-weekend` | Loop Weekend TVC |

(Note: YouTube limits *re*-downloading the same individual video to 5
times/day — downloading 29 *different* videos once each in one sitting
doesn't run into that.)

---

## Part 2 — Cloudflare account setup (you're creating this, handing to client)

1. Sign up at [cloudflare.com](https://cloudflare.com) (free — this is just
   the base account).
2. In the dashboard sidebar, find **Stream** and enable it — this is where
   billing starts (pay-as-you-go, ~$2–5/month at this project's scale, no
   separate signup needed beyond adding a payment method).
3. Note your **Account ID** — visible on the right-hand side of the Stream
   dashboard, or under **Account Home**.
4. Create an API token scoped for Stream: **My Profile → API Tokens →
   Create Token → Custom Token** → give it **Stream: Edit** permission on
   this account → create → copy the token (shown once).
5. Hand both the **Account ID** and this **API token** off however you plan
   to hand off the account to the client (a password manager entry, not
   plain chat/email).

---

## Part 3 — Run the upload script (once Part 1 + Part 2 are done)

```bash
cd /Users/neychevs/Documents/FAMILY/MLADEN/kalodimitrov
export CF_ACCOUNT_ID="<account id from Part 2>"
export CF_API_TOKEN="<api token from Part 2>"
node scripts/upload-to-cloudflare-stream.mjs /path/to/the/29/downloaded/files
```

The script (see `scripts/upload-to-cloudflare-stream.mjs`):
- Matches each file to a project by filename (must match the slugs above).
- Uploads it to Cloudflare Stream via their API.
- Polls until Cloudflare finishes processing (transcoding + thumbnail
  generation happen automatically on their end).
- Writes the resulting video UID for each slug to
  `src/data/cloudflare-stream-map.json`.

## Part 4 — After the upload

Once `cloudflare-stream-map.json` is populated, the code side is already
built to consume it (see `CloudflareStreamSource` in
`src/lib/video-source.ts` and the native-`<video>` playback path in
`src/scripts/video-layer.ts`) — projects with an entry in that map play via
Cloudflare's native `<video>` element; everything else keeps using YouTube
exactly as today. `npm run build`, screenshot/test per the checklist below,
then deploy as usual.

## Testing checklist after migration
- [ ] Home feed: migrated cues autoplay muted on scroll (desktop) — confirm
      this now also works reliably on mobile (the actual point of migrating)
- [ ] Detail overlay: play/pause, scrub, volume, prev/next all still work
      for migrated projects
- [ ] Gallery/list hover-preview frames still show for migrated projects
- [ ] Un-migrated (YouTube) projects are completely unaffected
- [ ] `npm run build` passes; no new hardcoded Cloudflare URLs outside
      `video-source.ts` (same discipline as the base-path/`withBase()` fixes)
