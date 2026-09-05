import manifest from '../data/poster-manifest.json' with { type: 'json' };

/** CR-003 — posters are pre-generated offline by scripts/optimize-posters.mjs
 *  and committed, not processed by Astro at build time (the cPanel deploy host
 *  cannot afford it; see the script's header). This module is the only place
 *  that knows the generated filename shape. */

export interface PosterEntry {
  widths: number[];
  width: number;
  height: number;
}

const posters = manifest as Record<string, PosterEntry>;

/** Pure — the base is passed in rather than read from import.meta so this is
 *  testable outside a Vite context. */
export function srcsetFor(slug: string, widths: number[], ext: string, base: string): string {
  return widths.map((w) => `${base}/posters/opt/${slug}-${w}.${ext} ${w}w`).join(', ');
}

export interface PosterSources {
  avif: string;
  jpeg: string;
  width: number;
  height: number;
}

export function posterSources(slug: string): PosterSources {
  const entry = posters[slug];
  if (!entry) {
    throw new Error(
      `no poster variants for "${slug}" — add the source to src/assets/posters/ ` +
        `and run: npm run optimize:posters`,
    );
  }
  // NOT withBase('') — that returns '/' at a root base (its `|| '/'` guard
  // catches the empty string), which would emit protocol-relative
  // "//posters/..." URLs pointing at a host called "posters".
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return {
    avif: srcsetFor(slug, entry.widths, 'avif', base),
    jpeg: `${base}/posters/opt/${slug}-1280.jpg`,
    width: entry.width,
    height: entry.height,
  };
}
