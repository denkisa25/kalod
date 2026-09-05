/** CR-003 — the home feed's 10 cues are an explicit, ordered, signed-off list
 *  rather than "the 10 most recent featured: true", for two reasons. The order
 *  is a creative decision nobody had made (a standing README open item), and
 *  every cue must be an own-channel upload so it can be served from Cloudflare
 *  Stream as a native <video> — a third-party-channel cue is stuck on a YouTube
 *  iframe and keeps the iOS autoplay failure in cr-002-mobile-playback-qa.md.
 *
 *  Pure and I/O-free so it can be unit-tested; projects.ts does the wiring.
 *  This file (plus src/data/featured.json) is also the intended integration
 *  point for a future admin panel: a simple UI that reads/writes that JSON
 *  needs no change here, since validation already lives in one place. */
export function pickFeatured(order: string[], known: Set<string>, limit: number): string[] {
  const unknown = order.filter((slug) => !known.has(slug));
  if (unknown.length) {
    throw new Error(
      `src/data/featured.json lists unknown slug(s): ${unknown.join(', ')} — ` +
        `every entry must match a slug in phase0/extraction/projects.json`,
    );
  }
  const repeated = [...new Set(order.filter((slug, i) => order.indexOf(slug) !== i))];
  if (repeated.length) {
    throw new Error(`src/data/featured.json repeats slug(s): ${repeated.join(', ')}`);
  }
  return order.slice(0, limit);
}
