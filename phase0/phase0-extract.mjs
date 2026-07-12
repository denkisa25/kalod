#!/usr/bin/env node
/**
 * PHASE 0 — BRAND & CONTENT EXTRACTION for kalodimitrov.com
 * ---------------------------------------------------------
 * What this does (see spec §3):
 *   1. Fetches the homepage, finds all linked stylesheets, downloads them.
 *   2. Mines the CSS for every color (hex/rgb) ranked by frequency,
 *      and every font-family declaration  -> ./extraction/brand-report.md
 *   3. Exports all WordPress posts via REST API -> ./extraction/projects.json
 *      (title, slug, roles/categories, video embed URL, featured image, excerpt)
 *   4. Writes the full old-URL list          -> ./extraction/redirect-map.csv
 *   5. Optionally downloads featured images  -> ./extraction/posters/
 *
 * Usage:   node phase0-extract.mjs            (Node 18+, no npm installs)
 *          node phase0-extract.mjs --images   (also download featured images)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITE = "https://kalodimitrov.com";
const OUT = join(__dirname, "extraction");
const WANT_IMAGES = process.argv.includes("--images");
// Category IDs on kalodimitrov.com: work=4, featured=9
// Without this filter the API returns 16k+ spam posts injected by attackers.
const WORK_CATEGORY_ID = 4;
const UA = { headers: { "User-Agent": "Mozilla/5.0 (Phase0 extraction; site owner authorized)" } };

const log = (m) => console.log(`  ${m}`);

async function get(url) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

/* ---------- 1+2. STYLESHEETS -> COLORS & FONTS ---------- */
async function extractBrand() {
  console.log("\n[1/4] Stylesheet mining");
  const html = await (await get(SITE)).text();

  // find stylesheet links + inline <style> blocks
  const cssUrls = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .map((u) => (u.startsWith("http") ? u : new URL(u, SITE).href))
    .filter((u) => !/fonts\.googleapis/.test(u)); // google fonts handled via font-family names
  const googleFonts = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"']+)/gi)].map((m) => decodeURIComponent(m[1]));
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);

  let allCss = inline.join("\n");
  for (const u of cssUrls) {
    try {
      allCss += "\n/* ==== " + u + " ==== */\n" + (await (await get(u)).text());
      log(`fetched ${u}`);
    } catch (e) { log(`SKIP ${u} (${e.message})`); }
  }
  await writeFile(`${OUT}/all-styles.css`, allCss);

  // colors, ranked by frequency (ignore pure resets like transparent/inherit)
  const colorHits = {};
  for (const m of allCss.matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|rgba?\([^)]+\)/gi)) {
    const c = m[0].toLowerCase();
    colorHits[c] = (colorHits[c] || 0) + 1;
  }
  const colors = Object.entries(colorHits).sort((a, b) => b[1] - a[1]);

  // font families, deduped
  const fonts = [...new Set(
    [...allCss.matchAll(/font-family\s*:\s*([^;}{]+)[;}]/gi)].map((m) => m[1].trim())
  )];

  // body/heading/link rules verbatim — the fastest way to see what applies where
  const keyRules = [];
  for (const sel of ["body", "html", "h1", "h2", "h3", "a", "a:hover", ".site-title", "#header", ".entry-title"]) {
    const re = new RegExp(`(^|[}\\s,])${sel.replace(/[.#:]/g, "\\$&")}\\s*\\{[^}]*\\}`, "gi");
    for (const m of allCss.matchAll(re)) keyRules.push(m[0].trim());
  }

  const report = [
    "# Brand extraction report — kalodimitrov.com",
    `Generated ${new Date().toISOString()}\n`,
    "## Colors by frequency (top 25)",
    ...colors.slice(0, 25).map(([c, n]) => `- \`${c}\`  ×${n}`),
    "\n## Font families found",
    ...fonts.map((f) => `- ${f}`),
    googleFonts.length ? "\n## Google Fonts requests\n" + googleFonts.map((g) => `- ${g}`).join("\n") : "",
    "\n## Key selector rules (verbatim)",
    "```css", ...keyRules, "```",
    "\n## → Fill spec §3 tokens from the above:",
    "```css",
    "--color-bg:      /* body background from key rules   */;",
    "--color-ink:     /* body color                       */;",
    "--color-heading: /* h1/h2/.entry-title color         */;",
    "--color-accent:  /* a / a:hover color                */;",
    "--font-display:  /* .site-title / h1 font-family     */;",
    "--font-body:     /* body font-family                 */;",
    "```",
  ].join("\n");
  await writeFile(`${OUT}/brand-report.md`, report);
  log(`-> ${OUT}/brand-report.md  (${colors.length} colors, ${fonts.length} font stacks)`);
}

/* ---------- 3. POSTS -> projects.json ---------- */
async function extractContent() {
  console.log("\n[2/4] Content export (WP REST API)");

  // Roles are stored as tags (music, mix, sound-design), not categories
  const tagMap = {};
  try {
    for (const t of await (await get(`${SITE}/wp-json/wp/v2/tags?per_page=100`)).json()) tagMap[t.id] = t.slug;
  } catch { log("no tags endpoint — roles will be empty"); }

  const projects = [];
  for (let page = 1; page < 20; page++) {
    let posts;
    try {
      const r = await get(`${SITE}/wp-json/wp/v2/posts?per_page=100&page=${page}&categories=${WORK_CATEGORY_ID}&_embed`);
      posts = await r.json();
    } catch { break; } // 400 past last page
    if (!Array.isArray(posts) || posts.length === 0) break;

    for (const p of posts) {
      const body = p.content?.rendered || "";
      // video embed: first iframe (youtube/vimeo) or raw URL in body
      const iframe = body.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] || null;
      const rawUrl = body.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)[^\s"'<]+/i)?.[0] || null;
      const isFeatured = (p.categories || []).includes(9); // category id=9 slug=featured
      projects.push({
        title: p.title?.rendered?.replace(/&#\d+;|&[a-z]+;/g, (s) => ({ "&amp;": "&", "&#8220;": "“", "&#8221;": "”", "&#8217;": "’" }[s] || s)).trim(),
        slug: p.slug,
        old_url: p.link,
        date: p.date,
        featured: isFeatured,
        roles: (p.tags || []).map((id) => tagMap[id]).filter(Boolean),
        video: iframe || rawUrl,
        poster: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null,
        excerpt: (p.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim(),
      });
    }
    log(`page ${page}: ${posts.length} posts`);
    if (posts.length < 100) break;
  }
  await writeFile(`${OUT}/projects.json`, JSON.stringify(projects, null, 2));
  log(`-> ${OUT}/projects.json  (${projects.length} projects)`);
  return projects;
}

/* ---------- 4. REDIRECT MAP ---------- */
async function redirectMap(projects) {
  console.log("\n[3/4] Redirect map");
  const rows = [["old_path", "new_path_SUGGESTED"]];
  for (const p of projects) rows.push([new URL(p.old_url).pathname, `/work/${p.slug}/`]);
  for (const [o, n] of [["/about/", "/about"], ["/contacts/", "/contacts"], ["/category/work/", "/work"], ["/page/2/", "/work"], ["/page/3/", "/work"]]) rows.push([o, n]);
  await writeFile(`${OUT}/redirect-map.csv`, rows.map((r) => r.join(",")).join("\n"));
  log(`-> ${OUT}/redirect-map.csv  (${rows.length - 1} redirects)`);
}

/* ---------- 5. POSTERS (optional) ---------- */
async function downloadPosters(projects) {
  console.log("\n[4/4] Featured images");
  if (!WANT_IMAGES) return log("skipped (run with --images to download)");
  await mkdir(`${OUT}/posters`, { recursive: true });
  for (const p of projects.filter((x) => x.poster)) {
    try {
      const ext = p.poster.split(".").pop().split("?")[0];
      const r = await get(p.poster);
      await pipeline(Readable.fromWeb(r.body), createWriteStream(`${OUT}/posters/${p.slug}.${ext}`));
      log(p.slug);
    } catch (e) { log(`SKIP ${p.slug} (${e.message})`); }
  }
}

/* ---------- run ---------- */
await mkdir(OUT, { recursive: true });
await extractBrand();
const projects = await extractContent();
await redirectMap(projects);
await downloadPosters(projects);
console.log("\nDone. Open extraction/brand-report.md, fill spec §3 tokens, then paste the token values into the opener demo (:root block) and Claude Design.\n");
