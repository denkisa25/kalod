#!/usr/bin/env node
// CR-003 — offline prep for the five studio photographs, the same treatment
// scripts/optimize-posters.mjs gives the poster set and for a harder reason.
//
// These are the ONLY images left going through Astro's build-time image
// pipeline, and on the cPanel host that pipeline segfaults: libvips takes a
// SIGSEGV on the 4032x3024 sources after all 53 pages have already rendered
// (exit 139, "generating optimized images"). The repo has hit this before —
// the VIPS_DISC_THRESHOLD note in deploy.sh is the earlier round of it. The
// account's real ceilings are LVE cgroup limits that ulimit cannot even read,
// so tuning against them is guesswork; removing the work from the host is not.
//
// After this, the deploy does zero image processing.
//
//   npm run optimize:studio
import sharp from 'sharp';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(ROOT, 'src/assets/studio');
const OUT_DIR = join(ROOT, 'public/studio');
const MANIFEST = join(ROOT, 'src/data/studio-manifest.json');

// One ladder for all five. The consumers differ a lot in rendered size (a
// 340px about-page portrait against a full-bleed opener backdrop), so the
// sizes attribute at each call site picks from these rather than each slot
// getting a bespoke set.
const WIDTHS = [400, 800, 1280, 1920];

mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(SRC_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
if (sources.length === 0) throw new Error(`no studio sources in ${SRC_DIR}`);

const manifest = {};
let totalIn = 0;
let totalOut = 0;

for (const file of sources) {
  const name = basename(file, extname(file));
  const src = join(SRC_DIR, file);
  totalIn += statSync(src).size;

  const meta = await sharp(src).metadata();
  const widths = WIDTHS.filter((w) => w <= meta.width);
  if (widths.length === 0) widths.push(meta.width);

  for (const w of widths) {
    const avif = join(OUT_DIR, `${name}-${w}.avif`);
    await sharp(src).resize({ width: w }).avif({ quality: 50, effort: 6 }).toFile(avif);
    totalOut += statSync(avif).size;

    const webp = join(OUT_DIR, `${name}-${w}.webp`);
    await sharp(src).resize({ width: w }).webp({ quality: 80 }).toFile(webp);
    totalOut += statSync(webp).size;
  }

  manifest[name] = { widths, width: meta.width, height: meta.height };
  process.stdout.write(`${name.padEnd(12)} ${meta.width}x${meta.height}  ${widths.join('/')}\n`);
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${sources.length} studio photos`);
console.log(`sources  ${(totalIn / 1024 / 1024).toFixed(1)} MB  (not served)`);
console.log(`variants ${(totalOut / 1024 / 1024).toFixed(1)} MB  (served)`);
