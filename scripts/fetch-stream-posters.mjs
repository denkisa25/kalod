#!/usr/bin/env node
// CR-003 — take each cue's poster from the video itself.
//
// The posters were scraped from the old WordPress site, so their framing and
// even their aspect ratio have nothing to do with the video they sit in front
// of. viktoria-trailer-2 is the clearest case: an 841x1200 PORTRAIT image
// leading a full-bleed 16:9 feed, upscaled and cropped hard. Now that all 43
// cues are on Cloudflare Stream, a correctly-framed landscape frame can be
// pulled from the actual video.
//
// Frames are FETCHED AND COMMITTED, not linked. Pointing <img> at Cloudflare's
// thumbnail endpoint would mean a cross-origin JPEG on the critical path where
// there is currently a same-origin AVIF of a few KB — slower, and a needless
// runtime dependency for something that never changes. These land in
// src/assets/posters/ and go through scripts/optimize-posters.mjs like any
// other source.
//
//   node scripts/fetch-stream-posters.mjs [--dry-run] [--only <slug>]
//
// Per-slug timestamps live in src/data/poster-frames.json; anything not listed
// uses DEFAULT_TIME. Adjust that file and re-run to re-cut a specific poster.
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

// Far enough in to clear fades, titles and black leader, which is where most
// bad automatic thumbnails come from.
const DEFAULT_TIME = '4s';
const WIDTH = 1600;
const HEIGHT = 900;

const map = JSON.parse(readFileSync(join(ROOT, 'src/data/cloudflare-stream-map.json'), 'utf8'));
const framesPath = join(ROOT, 'src/data/poster-frames.json');
const frames = existsSync(framesPath) ? JSON.parse(readFileSync(framesPath, 'utf8')) : {};
// the file carries a human-readable _note alongside the slugs
delete frames._note;

const slugs = (ONLY ? [ONLY] : Object.keys(map)).filter((s) => map[s]);
if (ONLY && !map[ONLY]) throw new Error(`${ONLY} is not on Cloudflare Stream`);

console.log(`${slugs.length} cue(s); default frame at ${DEFAULT_TIME}\n`);
const suspicious = [];

for (const slug of slugs) {
  const time = frames[slug] ?? DEFAULT_TIME;
  const url = `${map[slug].thumbnailUrl}?time=${time}&width=${WIDTH}&height=${HEIGHT}&fit=crop`;

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  ${slug.padEnd(40)} FAILED ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const img = sharp(buf);
  const meta = await img.metadata();
  const stats = await img.stats();
  // Mean across channels, 0-255. A frame that is nearly black or nearly white
  // is usually a fade or a blown title card rather than a usable still, and is
  // exactly what naive automatic thumbnailing gets wrong.
  const mean = stats.channels.reduce((a, c) => a + c.mean, 0) / stats.channels.length;
  const flag = mean < 18 ? 'VERY DARK' : mean > 238 ? 'VERY BRIGHT' : '';
  if (flag) suspicious.push({ slug, time, mean: mean.toFixed(1), flag });

  const dir = join(ROOT, 'src/assets/posters');
  const out = join(dir, `${slug}.jpg`);

  // The scraped originals are a mix of .jpg and .png. Writing <slug>.jpg while
  // <slug>.png survives leaves TWO sources for one slug, and
  // optimize-posters.mjs then emits variants for both with the manifest entry
  // decided by readdir order. Retire the other extension explicitly. Learned
  // the hard way: a run without this created 21 duplicate pairs.
  const existing = readdirSync(dir).find((f) => f.replace(/\.(jpe?g|png)$/i, '') === slug);
  const stale = readdirSync(dir).filter(
    (f) => f.replace(/\.(jpe?g|png)$/i, '') === slug && f !== `${slug}.jpg`,
  );
  const prev = existing ? await sharp(join(dir, existing)).metadata() : null;
  const prevDesc = prev ? `${prev.width}x${prev.height}` : 'none';

  if (!DRY) {
    stale.forEach((f) => unlinkSync(join(dir, f)));
    writeFileSync(out, buf);
  }
  console.log(
    `  ${slug.padEnd(40)} ${time.padStart(4)}  ${prevDesc.padStart(10)} -> ${meta.width}x${meta.height}` +
      `  lum ${mean.toFixed(0).padStart(3)}${stale.length ? '  (retired ' + stale.join(',') + ')' : ''}` +
      `${flag ? '  <-- ' + flag : ''}`,
  );
}

if (suspicious.length) {
  console.log(`\n${suspicious.length} frame(s) worth eyeballing:`);
  for (const s of suspicious) console.log(`  ${s.slug}  at ${s.time}  luminance ${s.mean}  ${s.flag}`);
  console.log('\n  Set a different timestamp in src/data/poster-frames.json and re-run with');
  console.log('  --only <slug> to re-cut just that one.');
}
if (DRY) console.log('\ndry run — nothing written');
else console.log('\nnow run: npm run optimize:posters');
