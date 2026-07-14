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
  integrations: [sitemap()],
});
