#!/usr/bin/env node
// CR-003 — reconcile Cloudflare Stream with this repo, in one idempotent pass.
//
// Lists every video in the Stream account, matches each one back to a project
// slug, makes sure a progressive MP4 rendition exists, and writes
// src/data/cloudflare-stream-map.json — the file CloudflareStreamSource
// (src/lib/video-source.ts) reads via resolveVideoRef() in projects.ts.
//
// WHY THIS EXISTS SEPARATELY FROM upload-to-cloudflare-stream.mjs:
// that script uploads local files and enables MP4 as part of the same run.
// The 2026-09 migration was done by a different pipeline (yt-dlp on Unraid,
// see docs/deploy-session-summary.md) which uploaded successfully but never
// enabled the MP4 renditions. Cloudflare serves HLS by default, and a plain
// <video src> — which is what video-layer.ts creates — cannot play HLS on
// desktop Chrome or Firefox, only Safari/iOS. So the videos were live and the
// site would still have shown a black player on most desktops.
//
// MATCHING IS BY YOUTUBE ID, NOT TITLE. Each video carries meta.source_url
// (the original YouTube URL) set by the ingest pipeline; that id is matched
// against the embed URL in phase0/extraction/projects.json. Titles drift
// between YouTube and this repo ("BTT TV Talent Show Promo" vs "btv talent
// show") and would mismatch silently.
//
// Idempotent and safe to re-run: videos already carrying a ready MP4 are left
// alone, so this doubles as the wire-up step for any future batch.
//
//   export CF_ACCOUNT_ID=... CF_API_TOKEN=...
//   node scripts/sync-stream-map.mjs [--dry-run]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MAP_PATH = join(ROOT, 'src/data/cloudflare-stream-map.json');
const DRY = process.argv.includes('--dry-run');

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;
if (!accountId || !apiToken) {
  console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN (Stream:Edit scope) first.');
  console.error('Same values as /mnt/user/appdata/yt-ingest/.env on Unraid.');
  process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;
const headers = { Authorization: `Bearer ${apiToken}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** projects.json stores a full embed URL; pull the YouTube id out of it. */
function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/embed\/([\w-]+)/) || url.match(/(?:v=|youtu\.be\/)([\w-]+)/);
  return m ? m[1] : null;
}

const projects = JSON.parse(readFileSync(join(ROOT, 'phase0/extraction/projects.json'), 'utf8'));
const slugByYoutubeId = new Map();
for (const p of projects) {
  const id = youtubeId(p.video);
  if (id) slugByYoutubeId.set(id, p.slug);
}

async function listAllVideos() {
  const all = [];
  let page = 1;
  // Stream's list endpoint pages at 1000; asc order keeps runs reproducible.
  for (;;) {
    const res = await fetch(`${API}?per_page=1000&page=${page}&asc=true`, { headers });
    const body = await res.json();
    if (!body.success) throw new Error(`list failed: ${JSON.stringify(body.errors)}`);
    all.push(...body.result);
    if (body.result.length < 1000) break;
    page += 1;
  }
  return all;
}

/** POST /downloads is idempotent — it creates the rendition on first call and
 *  reports status on subsequent ones. Poll until Cloudflare finishes. */
async function ensureMp4(uid) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(`${API}/${uid}/downloads`, { method: 'POST', headers });
    const body = await res.json();
    if (!body.success) throw new Error(`enabling MP4 failed: ${JSON.stringify(body.errors)}`);
    const dl = body.result?.default;
    if (dl?.status === 'ready') return dl.url;
    if (dl?.status === 'error') throw new Error('Cloudflare reported an error generating the MP4');
    await sleep(5000);
  }
  throw new Error('timed out waiting for the MP4 rendition');
}

async function main() {
  const videos = await listAllVideos();
  console.log(`${videos.length} video(s) in the Stream account\n`);

  const map = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, 'utf8')) : {};
  const unmatched = [];
  let wrote = 0;

  for (const v of videos) {
    const sourceUrl = v.meta?.source_url || v.meta?.sourceUrl || '';
    const ytId = youtubeId(sourceUrl);
    const slug = ytId ? slugByYoutubeId.get(ytId) : null;

    if (!slug) {
      unmatched.push({ uid: v.uid, name: v.meta?.name ?? '(no name)', sourceUrl: sourceUrl || '(none)' });
      continue;
    }
    if (!v.readyToStream) {
      console.log(`  ${slug.padEnd(42)} SKIP — not readyToStream yet`);
      continue;
    }
    if (map[slug]?.mp4Url && map[slug].uid === v.uid) {
      console.log(`  ${slug.padEnd(42)} already mapped`);
      continue;
    }

    if (DRY) {
      console.log(`  ${slug.padEnd(42)} would enable MP4 (uid ${v.uid})`);
      continue;
    }

    process.stdout.write(`  ${slug.padEnd(42)} enabling MP4... `);
    try {
      const mp4Url = await ensureMp4(v.uid);
      // Same customer subdomain as the MP4; thumbnails need no enable step.
      const thumbnailUrl = mp4Url.replace('/downloads/default.mp4', '/thumbnails/thumbnail.jpg');
      // HLS is the PREFERRED source (adaptive bitrate); the MP4 stays as the
      // fallback for browsers without native HLS where hls.js also fails.
      // Both derive from the same customer subdomain, so no extra API call.
      const hlsUrl = mp4Url.replace('/downloads/default.mp4', '/manifest/video.m3u8');
      map[slug] = { uid: v.uid, mp4Url, hlsUrl, thumbnailUrl };
      writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
      wrote += 1;
      console.log('ready');
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  if (unmatched.length) {
    console.log(`\n${unmatched.length} Stream video(s) matched no project slug:`);
    for (const u of unmatched) console.log(`  ${u.uid}  ${u.name}  <- ${u.sourceUrl}`);
    console.log('  (fix meta.source_url on the video, or add the project to projects.json)');
  }

  console.log(`\n${Object.keys(map).length} slug(s) in the map${DRY ? ' (dry run — nothing written)' : `, ${wrote} updated this run`}`);
}

main();
