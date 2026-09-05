#!/usr/bin/env node
// CR-003 — guards the invariant that every home cue can be served from
// Cloudflare Stream. Advisory while src/data/cloudflare-stream-map.json is
// still empty (Task 6 has not run yet); hard failure once it is populated,
// because at that point a missing slug means a cue silently fell back to a
// YouTube iframe and reintroduced the iOS autoplay failure.
//
//   npm run check:featured
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const { order } = read('src/data/featured.json');
const streamMap = read('src/data/cloudflare-stream-map.json');
const projects = read('phase0/extraction/projects.json');

const knownSlugs = new Set(projects.map((p) => p.slug));
const unknown = order.filter((s) => !knownSlugs.has(s));
if (unknown.length) {
  console.error(`FAIL: featured.json lists slugs no project provides: ${unknown.join(', ')}`);
  process.exit(1);
}

const migrated = order.filter((s) => streamMap[s]);
const notMigrated = order.filter((s) => !streamMap[s]);

console.log(`featured cues: ${order.length}`);
console.log(`on cloudflare stream: ${migrated.length}`);
if (notMigrated.length) console.log(`still on youtube: ${notMigrated.join(', ')}`);

if (Object.keys(streamMap).length === 0) {
  console.log('\nadvisory: cloudflare-stream-map.json is empty — CR-003 task 6 has not run yet.');
  process.exit(0);
}
if (notMigrated.length) {
  console.error(
    `\nFAIL: ${notMigrated.length} home cue(s) are not on Stream. Each one falls back to a` +
      ` YouTube iframe, which does not autoplay on iOS (cr-002-mobile-playback-qa.md).`,
  );
  process.exit(1);
}
console.log('\nPASS: every home cue is served from cloudflare stream.');
