// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// WHERE THE SITE IS SERVED FROM.
//
// cPanel copies dist/ into a server folder literally named "new", so the base
// has to match that folder. Note that "new" is NOT a directory inside dist/ —
// the base only ever appears as a prefix in generated URLs. Any host that
// serves dist/ at its own root (Cloudflare Pages/Workers, netlify, a plain
// static server) must therefore override this to '/', or every asset link
// points at /new/_astro/... and 404s.
//
//   SITE_BASE=/ npm run build
//
// MUST become '/' for the real domain-root launch too.
const BASE = process.env.SITE_BASE || '/new';

// WHETHER THIS BUILD MAY BE INDEXED.
//
// Deliberately INDEPENDENT of BASE, and opt-in. These are two different
// questions — a preview served at the root is still work in progress — and
// coupling them once already meant "serve at root" would silently have
// un-noindexed a client preview. Only an explicit INDEXABLE=true build emits
// a sitemap and omits the noindex meta:
//
//   SITE_BASE=/ INDEXABLE=true npm run build     # the launch build
//
// Everything else — cPanel, Cloudflare previews, local — stays noindex by
// default, which is the safe direction to fail in.
const INDEXABLE = process.env.INDEXABLE === 'true';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://kalodimitrov.com',
  base: BASE,
  integrations: [
    // A sitemap is an active invitation to index. There is no point publishing
    // one for a noindex work-in-progress site — and it was the loudest signal
    // pointing crawlers at kalodimitrov.com/new, which cannot be protected by
    // Cloudflare Access while the domain's DNS sits with the host.
    //
    // CR-002 §0.4 / §3.3 — when it does come back, the stem-player lab route
    // stays out of it. Any future /lab/* route is covered by the same filter.
    ...(INDEXABLE ? [sitemap({ filter: (page) => !/\/lab\//.test(page) })] : []),
  ],

  // Surfaced to BaseLayout, which decides whether to emit the noindex meta.
  // Vite's define does a build-time literal substitution, so the flag cannot
  // drift between the sitemap decision above and the meta tag.
  vite: {
    define: {
      'import.meta.env.SITE_INDEXABLE': JSON.stringify(INDEXABLE),
    },
  },
});
