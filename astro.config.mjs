// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TEMPORARY: only while previewing at kalodimitrov.com/new/ pending DNS
// propagation for the staging subdomain. MUST become '/' before the real
// domain-root launch — production is served from "/", not "/new".
//
// This single value now also gates indexing. While it is anything other than
// '/', the site is work in progress: BaseLayout emits `noindex, nofollow`
// (see the note there) and no sitemap is published. Setting it back to '/'
// turns both on again in one edit, so launch cannot half-happen.
/** @type {string} */ // widened: without this, ts-check narrows BASE to the
// literal '/new' and flags the comparison below as unintentional.
const BASE = '/new';
const IS_PREVIEW_SUBPATH = BASE !== '/';

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
    ...(IS_PREVIEW_SUBPATH ? [] : [sitemap()]),
  ],
});
