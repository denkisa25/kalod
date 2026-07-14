/** Prefixes an absolute internal path with Astro's configured base path
 *  (import.meta.env.BASE_URL — always "/" unless astro.config.mjs sets a
 *  non-root `base`). Astro only base-prefixes URLs it generates itself
 *  (assets, bundles); hardcoded hrefs like "/about" need this to stay under
 *  a non-root base instead of jumping to the domain root. With no `base`
 *  configured this is a no-op (BASE_URL is "/"), so every call site using
 *  this can stay as-is permanently, not just while a temporary base is set. */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path}` || '/';
}
