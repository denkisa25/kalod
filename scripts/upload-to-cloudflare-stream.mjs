#!/usr/bin/env node
// One-off migration script — YouTube -> Cloudflare Stream (docs/video-migration-guide.md).
// Uploads every video file in the given directory whose filename (without
// extension) matches a project slug in phase0/extraction/projects.json,
// polls Cloudflare until each finishes processing, and writes the resulting
// video UIDs to src/data/cloudflare-stream-map.json — consumed by
// CloudflareStreamSource in src/lib/video-source.ts.
//
// Requires CF_ACCOUNT_ID and CF_API_TOKEN (Stream:Edit scope) in the
// environment. Safe to re-run: already-migrated slugs (already present in
// the map) are skipped, so a partial batch (not all 29 files downloaded
// yet) can be topped up later without re-uploading anything.
//
// Usage:
//   export CF_ACCOUNT_ID="..."
//   export CF_API_TOKEN="..."
//   node scripts/upload-to-cloudflare-stream.mjs /path/to/downloaded/videos
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MAP_PATH = join(ROOT, 'src/data/cloudflare-stream-map.json');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;
const dir = process.argv[2];

if (!accountId || !apiToken) {
  console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN first (see docs/video-migration-guide.md Part 2).');
  process.exit(1);
}
if (!dir) {
  console.error('Usage: node scripts/upload-to-cloudflare-stream.mjs /path/to/downloaded/videos');
  process.exit(1);
}

const projects = JSON.parse(readFileSync(join(ROOT, 'phase0/extraction/projects.json'), 'utf8'));
const validSlugs = new Set(projects.map((p) => p.slug));

const existingMap = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, 'utf8')) : {};

const API = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;
const headers = { Authorization: `Bearer ${apiToken}` };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadOne(slug, filePath) {
  const fileBuffer = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), basename(filePath));
  form.append('meta', JSON.stringify({ name: slug }));

  const res = await fetch(API, { method: 'POST', headers, body: form });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`upload failed for ${slug}: ${JSON.stringify(body.errors)}`);
  }
  const uid = body.result.uid;

  // Cloudflare transcodes asynchronously — poll until ready rather than
  // moving on before the video is actually playable.
  for (let attempt = 0; attempt < 60; attempt++) {
    const statusRes = await fetch(`${API}/${uid}`, { headers });
    const statusBody = await statusRes.json();
    const state = statusBody.result?.status?.state;
    if (state === 'ready') break;
    if (state === 'error') throw new Error(`Cloudflare processing failed for ${slug}: ${JSON.stringify(statusBody.result.status)}`);
    await sleep(5000);
  }

  // A plain <video> tag needs a direct MP4, not the HLS manifest Cloudflare
  // serves by default — HLS only plays natively in a <video> tag on Safari/
  // iOS, not desktop Chrome/Firefox, without an extra JS library (hls.js).
  // Enabling the MP4 rendition is a separate, also-async step.
  let mp4Url = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const dlRes = await fetch(`${API}/${uid}/downloads`, { method: 'POST', headers });
    const dlBody = await dlRes.json();
    if (!dlBody.success) throw new Error(`enabling MP4 download failed for ${slug}: ${JSON.stringify(dlBody.errors)}`);
    if (dlBody.result.default.status === 'ready') {
      mp4Url = dlBody.result.default.url;
      break;
    }
    await sleep(5000);
  }
  if (!mp4Url) throw new Error(`timed out waiting for ${slug} (uid ${uid})'s MP4 rendition`);

  return { uid, mp4Url };
}

async function main() {
  const files = readdirSync(dir).filter((f) => VIDEO_EXTENSIONS.has(extname(f).toLowerCase()));
  const toProcess = files
    .map((f) => ({ slug: basename(f, extname(f)), path: join(dir, f) }))
    .filter(({ slug }) => {
      if (!validSlugs.has(slug)) {
        console.warn(`skip: "${slug}" doesn't match any project slug — check the filename`);
        return false;
      }
      if (existingMap[slug]) {
        console.log(`skip: "${slug}" already migrated (uid ${existingMap[slug].uid})`);
        return false;
      }
      return true;
    });

  console.log(`Uploading ${toProcess.length} video(s)...`);

  for (const { slug, path } of toProcess) {
    const sizeMb = (statSync(path).size / 1_000_000).toFixed(1);
    process.stdout.write(`  ${slug} (${sizeMb}MB)... `);
    try {
      const { uid, mp4Url } = await uploadOne(slug, path);
      // Thumbnail generation needs no separate enable step (unlike MP4) —
      // derive its URL from the same customer subdomain as the MP4 link.
      const thumbnailUrl = mp4Url.replace('/downloads/default.mp4', '/thumbnails/thumbnail.jpg');
      existingMap[slug] = { uid, mp4Url, thumbnailUrl };
      writeFileSync(MAP_PATH, JSON.stringify(existingMap, null, 2) + '\n');
      console.log(`done (uid ${uid})`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  console.log(`\n${Object.keys(existingMap).length}/${validSlugs.size} project slugs migrated so far.`);
  console.log(`Map written to ${MAP_PATH}`);
}

main();
