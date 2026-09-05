#!/usr/bin/env node
// CR-003 — offline poster prep. Reads the untouched sources in
// src/assets/posters/ and writes responsive AVIF + a JPEG fallback into
// public/posters/opt/, plus a manifest of what exists at what size.
//
// Deliberately NOT Astro's <Image> component. That processes at build time,
// and the cPanel deploy host runs the build under --max-old-space-size=700,
// VIPS_CONCURRENCY=1 and taskset -c 0,1 against a 1.4GB account cap — see the
// commit history around 3906342/ce13cd3/86c44e8, which is what it took to make
// the build survive thirteen studio photos. Adding 48 posters to that pipeline
// would put it straight back into OOM. Generated output is committed instead,
// which costs repo size and buys a deploy that cannot fail on image processing.
//
// Same convention as scripts/duotone-pattern.mjs. Run when a poster changes:
//   npm run optimize:posters
import sharp from 'sharp';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(ROOT, 'src/assets/posters');
const OUT_DIR = join(ROOT, 'public/posters/opt');
const MANIFEST = join(ROOT, 'src/data/poster-manifest.json');

// 480 covers work-list thumbnails (160px slot at 3x) and gallery tiles;
// 960 covers gallery tiles on wide screens and mobile full-bleed;
// 1600 covers the full-bleed home cue and the project detail still.
const WIDTHS = [480, 960, 1600];
const FALLBACK_WIDTH = 1280;

mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(SRC_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
if (sources.length === 0) throw new Error(`no poster sources in ${SRC_DIR}`);

const manifest = {};
let totalIn = 0;
let totalOut = 0;

for (const file of sources) {
  const slug = basename(file, extname(file));
  const src = join(SRC_DIR, file);
  totalIn += statSync(src).size;

  const meta = await sharp(src).metadata();
  // never upscale — a 640px-wide source has no 1600px variant to offer
  const widths = WIDTHS.filter((w) => w <= meta.width);
  if (widths.length === 0) widths.push(meta.width);

  for (const w of widths) {
    const avif = join(OUT_DIR, `${slug}-${w}.avif`);
    await sharp(src).resize({ width: w }).avif({ quality: 45, effort: 6 }).toFile(avif);
    totalOut += statSync(avif).size;
  }

  const jpeg = join(OUT_DIR, `${slug}-${FALLBACK_WIDTH}.jpg`);
  await sharp(src)
    .resize({ width: Math.min(FALLBACK_WIDTH, meta.width) })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(jpeg);
  totalOut += statSync(jpeg).size;

  manifest[slug] = { widths, width: meta.width, height: meta.height };
  process.stdout.write(`${slug.padEnd(42)} ${widths.join('/')}\n`);
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${sources.length} posters`);
console.log(`sources  ${(totalIn / 1024 / 1024).toFixed(1)} MB  (not served)`);
console.log(`variants ${(totalOut / 1024 / 1024).toFixed(1)} MB  (served)`);
