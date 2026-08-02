# CR-002 Stage 3 — Cloudflare Pages branch preview

Runbook for §4. **Read the two corrections first — §4 was written against an
assumed Cloudflare deployment, and this site is on cPanel.**

---

## Corrections to §4

**1. There is no Pages project yet.** §4 says "configure the Cloudflare Pages
preview for branch `stem-player`", which presupposes a project. The live site
deploys through cPanel Git Version Control from `main`, built in place at
`/home/kickstic/public_html/kalodimitrov.com/new`. Stage 3 is therefore
*create a Pages project*, not *add a branch to one*.

Nothing about this replaces the cPanel deploy. Pages is being added as a
preview surface only. `main` keeps deploying to cPanel exactly as it does now.

**2. Cloudflare Access does not work on `kalodimitrov.com/new` today.** §4
recommends putting Access in front of `/new`, but Access can only protect a
hostname whose DNS is on Cloudflare and proxied. This domain's DNS is at the
host — the `new.kalodimitrov.com` subdomain was created in cPanel.

The distinction that matters:

| Target | Access works? |
|---|---|
| `stem-player.<project>.pages.dev` (the preview) | **Yes** — Pages has a built-in toggle, no DNS change needed |
| `kalodimitrov.com/new` (the cPanel site) | **No** — needs the domain's DNS moved to Cloudflare first |

So Part C below protects the preview, which is the thing this CR actually
creates. Protecting the cPanel `/new` is a separate decision (move DNS to
Cloudflare, or use HTTP basic auth via `.htaccess` — but see the caveat in
Part E: `phase0/generate-htaccess.mjs` overwrites that file on every deploy,
so any auth rules must be folded into the generator, not hand-added).

---

## Part A — push the branch (required first)

Pages builds branches that exist on GitHub. `stem-player` is currently local
only, two commits ahead.

```bash
git push -u origin stem-player
```

This publishes the Stage 1 + Stage 2 work. It does **not** touch `main` and
does not trigger a cPanel deploy (cPanel only builds `main`).

---

## Part B — create the Pages project

1. **dash.cloudflare.com** → **Workers & Pages** → **Create** →
   **Pages** tab → **Connect to Git**.
2. Authorise GitHub if prompted, then pick **`denkisa25/kalod`**.
3. **Project name:** `kalodimitrov`.
   This is what fixes the alias — the preview becomes
   `stem-player.kalodimitrov.pages.dev`. Pick it deliberately; renaming later
   changes every URL, including the one added to the R2 CORS allowlist in §5.
4. **Production branch:** `main`.
5. **Build settings:**
   | Field | Value |
   |---|---|
   | Framework preset | Astro |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

   **Do not use `deploy.sh`.** It sources
   `/home/kickstic/nodevenv/.../activate` and wraps the build in `taskset -c
   0,1` — a workaround for that account's LVE CPU entitlement, which caused
   the Rolldown SIGABRT. Neither exists on a Pages runner, and the underlying
   problem does not either.
6. **Environment variables** → add:
   ```
   NODE_VERSION = 22.12.0
   ```
   `package.json` requires `>=22.12.0`; Pages' default is older and the build
   will fail without this.
7. **Save and Deploy.**

## Part C — restrict and protect previews

Still in the project → **Settings**:

1. **Builds & deployments → Preview deployments → Configure**
   Choose **Custom branches** and set the include list to exactly:
   ```
   stem-player
   ```
   Without this, Pages builds a preview for every branch you ever push.
2. **Access policy** (Settings → General, or Zero Trust → Access →
   Applications): enable Access for **preview deployments**. Free for this
   team size. Add yourself and Kaloyan by email; they get a one-time code, no
   account needed.

   Do this *before* sending the link. A pages.dev URL is publicly reachable
   and crawlable the moment it exists.

## Part D — the URL, and the `base: '/new'` catch

The preview alias is deterministic:

```
https://stem-player.kalodimitrov.pages.dev
```

But `astro.config.mjs` still sets `base: '/new'`, so every built path is
prefixed. The stem player is therefore at:

```
https://stem-player.kalodimitrov.pages.dev/new/lab/stems
```

and the bare root will 404. That is expected, not a misconfiguration.

Two ways to handle it:

- **Leave it** (recommended for now). The `/new` base is load-bearing for the
  cPanel deploy and must not be changed casually — it is already flagged for
  removal at real launch. Just send the full path.
- **Make the base build-time configurable.** A two-line change so Pages can
  build at root (`SITE_BASE=/`) while cPanel keeps `/new` by default. Say the
  word and I'll do it — it is low risk but it touches the config that
  production depends on, so I am not doing it unasked.

## Part E — what is *not* done here

- **Access on `kalodimitrov.com/new`** — needs the DNS decision above. If you
  want it protected now without moving DNS, the route is basic auth folded
  into `phase0/generate-htaccess.mjs` (a hand-written `.htaccess` will not
  survive the next deploy, which regenerates that file wholesale).
- **R2 / Stream provisioning (§5)** — deferred until a Stream subscription
  exists and real assets arrive. When it happens,
  `stem-player.kalodimitrov.pages.dev` from Part B.3 is the origin that goes
  in the CORS allowlist.

## Verification

1. Pages build log shows `54 page(s) built`.
2. `https://stem-player.kalodimitrov.pages.dev/new/lab/stems` loads, and
   prompts for Access first.
3. Press play — four stems load and the picture runs. Confirms the committed
   `public/audio/stems/*.m4a` (3.3 MB) deployed intact.
4. `https://stem-player.kalodimitrov.pages.dev/new/sitemap-index.xml` does not
   list `/lab/stems`.
