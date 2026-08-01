// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://kalodimitrov.com',
  // TEMPORARY: only while previewing at kalodimitrov.com/new/ pending DNS
  // propagation for the staging subdomain. MUST be removed before the real
  // domain-root launch — production is served from "/", not "/new".
  base: '/new',
  // CR-002 §0.4 / §3.3 — the stem-player lab route is noindex, unlinked from
  // nav, and must not appear in the sitemap either. Any future /lab/* route
  // is covered by the same filter.
  integrations: [sitemap({ filter: (page) => !/\/lab\//.test(page) })],
});
