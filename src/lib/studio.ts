import manifest from '../data/studio-manifest.json' with { type: 'json' };

/** CR-003 — the studio photographs are pre-generated offline by
 *  scripts/optimize-studio.mjs and committed, not processed by Astro at build
 *  time. They were the last thing using the build-time image pipeline, and that
 *  pipeline segfaults libvips on the cPanel host (exit 139, after all 53 pages
 *  have already rendered). Same reasoning as src/lib/posters.ts. */

export interface StudioEntry {
  widths: number[];
  width: number;
  height: number;
}

const studio = manifest as Record<string, StudioEntry>;

export interface StudioSources {
  avif: string;
  webp: string;
  /** largest generated width — for a plain src fallback and for preloading */
  src: string;
  width: number;
  height: number;
}

export function studioSources(name: string): StudioSources {
  const entry = studio[name];
  if (!entry) {
    throw new Error(
      `no studio variants for "${name}" — add the source to src/assets/studio/ ` +
        `and run: npm run optimize:studio`,
    );
  }
  // NOT withBase('') — that returns '/' at a root base, which would emit
  // protocol-relative "//studio/..." URLs. Same trap as posters.ts.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const largest = entry.widths[entry.widths.length - 1];
  return {
    avif: entry.widths.map((w) => `${base}/studio/${name}-${w}.avif ${w}w`).join(', '),
    webp: entry.widths.map((w) => `${base}/studio/${name}-${w}.webp ${w}w`).join(', '),
    src: `${base}/studio/${name}-${largest}.webp`,
    width: entry.width,
    height: entry.height,
  };
}
