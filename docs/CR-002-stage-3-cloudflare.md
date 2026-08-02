# CR-002 Stage 3 — Cloudflare Pages branch preview

Runbook for §4. **Read the corrections first — §4 was written against an
assumed Cloudflare deployment, and this site is on cPanel.**

---

## Corrections to §4

**1. There is no Pages project yet.** §4 says "configure the Cloudflare Pages
preview for branch `stem-player`", which presupposes a project. The live site
deploys through cPanel Git Version Control from `main`, built in place at
`/home/kickstic/public_html/kalodimitrov.com/new`. Stage 3 is therefore
*create a Pages project*, not *add a branch to one*.

Nothing here replaces the cPanel deploy. Pages is a preview surface only;
`main` keeps deploying to cPanel exactly as it does now.

**2. Cloudflare Access does not work on `kalodimitrov.com/new`.** §4
recommends putting Access in front of `/new`, but Access can only protect a
hostname whose DNS is on Cloudflare and proxied. This domain's DNS is with the
host, and there is no management access at present.

| Target | Access works? |
|---|---|
| `stem-player.kalodimitrov.pages.dev` (the preview) | **Yes** — built-in Pages toggle, no DNS change |
| `kalodimitrov.com/new` (the cPanel site) | **No** — needs DNS moved to Cloudflare first |

The cPanel site is instead covered by a site-wide `noindex, nofollow`
(shipped in `6b2ce0f`). That stops indexing, not access.

**3. The dashboard now steers new projects to Workers.** "Connect to Git" from
the default Create screen produces a *Worker* — the giveaway is a deploy
command of `npx wrangler deploy` and a prompt to create an API token. That
path needs a `wrangler.jsonc` this repo does not have, and would fail
immediately. Use the Pages tab specifically (Part B).

---

## Part A — push the branch ✅ done

`stem-player` is on GitHub. Nothing to do.

## Part B — create the Pages project

1. **dash.cloudflare.com** → **Workers & Pages** → **Create**.
2. Select the **Pages** tab — *not* the default Workers flow. If the UI hides
   it, go direct:
   ```
   https://dash.cloudflare.com/<account-id>/workers-and-pages/create/pages
   ```
   Then **Connect to Git**.
3. Authorise GitHub if prompted, then pick **`denkisa25/kalod`**.
4. **Project name:** `kalodimitrov`.
   This fixes the alias to `stem-player.kalodimitrov.pages.dev`. Choose it
   deliberately — renaming later changes every URL, including the origin added
   to the R2 CORS allowlist in §5.
5. **Production branch:** `main`.
6. **Build settings:**
   | Field | Value |
   |---|---|
   | Framework preset | Astro |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

   **Do not use `deploy.sh`.** It sources
   `/home/kickstic/nodevenv/.../activate` and wraps the build in `taskset -c
   0,1` — a workaround for that account's LVE CPU entitlement, which caused the
   Rolldown SIGABRT. Neither exists on a Pages runner, and neither does the
   underlying problem.
7. **Environment variables** — both are required:
   ```
   NODE_VERSION = 22.12.0
   SITE_BASE    = /
   ```
   `NODE_VERSION`: `package.json` requires `>=22.12.0` and Pages defaults to
   older; the build fails without it.

   `SITE_BASE`: **critical.** `dist/` contains no `new/` directory — the
   default `base: '/new'` is only a prefix in generated URLs, and cPanel works
   because it copies `dist/` *into* a folder called `new`. Pages serves `dist/`
   at its own root, so without this every asset link points at
   `/new/_astro/…` and 404s.

   Indexing is *not* affected: builds are noindex unless `INDEXABLE=true`,
   which is deliberately independent of the base. Do not set it here.
8. **Save and Deploy.**

## Part C — restrict and protect previews

Project → **Settings**:

1. **Builds & deployments → Preview deployments → Configure** → **Custom
   branches**, include list exactly:
   ```
   stem-player
   ```
   Without this, Pages builds a preview for every branch ever pushed.
2. Trigger the branch build: **Deployments → Create deployment →
   `stem-player`**, or push any commit to it.
3. **Access** (Settings → General, or Zero Trust → Access → Applications):
   enable for **preview deployments**. Free at this team size; viewers get a
   one-time email code, no account needed.

   Judgement call: the whole preview is already `noindex`, so this is about
   *access*, not crawlers. Demoing live on a call — skip it, less friction.
   Sending a link he opens alone — enable it, so a stray forward does not put
   a work-in-progress build in front of a stranger.

## Part D — the demo URL

```
https://stem-player.kalodimitrov.pages.dev/lab/stems
```

No `/new` segment — that is what `SITE_BASE=/` removes.

## Part E — what is *not* done here

- **Access on `kalodimitrov.com/new`** — blocked on the DNS decision. Without
  it, `noindex` is the mitigation in place. For real access control the route
  is HTTP basic auth folded into `phase0/generate-htaccess.mjs`; a hand-written
  `.htaccess` will not survive the next deploy, which regenerates that file
  wholesale.
- **R2 / Stream provisioning (§5)** — deferred until a Stream subscription
  exists and real assets arrive. `stem-player.kalodimitrov.pages.dev` from
  Part B.4 is the origin that goes in the CORS allowlist.

## Verification

1. Build log ends with **`54 page(s) built`**. 53 means it built `main`, not
   `stem-player`.
2. `https://stem-player.kalodimitrov.pages.dev/lab/stems` loads (via Access if
   enabled). Page renders with styling — broken styling means `SITE_BASE` did
   not apply.
3. Press play: four stems load, timecode runs, toggles cut each stem. Confirms
   the 3.3 MB of committed audio deployed intact.
4. View source: `<meta name="robots" content="noindex, nofollow">` present.
5. `/sitemap-index.xml` 404s.
