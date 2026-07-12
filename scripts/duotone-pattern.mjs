#!/usr/bin/env node
// One-off asset prep for CR-16 (docs/change-requests/cr-001-addendum-and-session.md).
// D7 (CLAUDE.md): duotone the legacy heritage pattern from --color-bg into a
// low-saturation tint of --color-accent, at build time, with no new :root
// token. This script reads the two authoritative tokens straight out of
// tokens.css (not hardcoded here) so it stays correct if they ever change,
// and also samples the *generated* image's own bottom row for a seam-safe
// background-color, so /work /about /contacts /404 never show a hard edge
// below the pattern's 1260px height (addendum requirement 4).
//
// Run manually when the source pattern or tokens change:
//   node scripts/duotone-pattern.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'public/patterns/bgr.jpg');
const OUT_WEBP = join(ROOT, 'public/patterns/bgr-duotone.webp');
const OUT_DATA = join(ROOT, 'src/data/pattern-color.json');

function readToken(name) {
  const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found in tokens.css`);
  return m[1];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb({ h, s, l }) {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255),
  };
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const bgHex = readToken('--color-bg');
const accentHex = readToken('--color-accent');
const colorDark = hexToRgb(bgHex);

// "low-saturation tint" of the accent, not a raw blend with bg — desaturate
// toward neutral and lift lightness slightly (a tint mixes toward white),
// per D7/D5 (tinted, subtle ground, never the raw legacy steel-blue).
const accentHsl = rgbToHsl(hexToRgb(accentHex));
const colorLight = hslToRgb({ h: accentHsl.h, s: 0.15, l: Math.min(accentHsl.l + 0.04, 1) });

const { data, info } = await sharp(SRC)
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const out = Buffer.alloc(width * height * 3);
for (let i = 0; i < width * height; i++) {
  const g = data[i * channels] / 255;
  out[i * 3] = Math.round(colorDark.r + (colorLight.r - colorDark.r) * g);
  out[i * 3 + 1] = Math.round(colorDark.g + (colorLight.g - colorDark.g) * g);
  out[i * 3 + 2] = Math.round(colorDark.b + (colorLight.b - colorDark.b) * g);
}

await sharp(out, { raw: { width, height, channels: 3 } }).webp({ quality: 82 }).toFile(OUT_WEBP);

// sample the generated image's own bottom row for a seam-safe fallback colour
let br = 0, bg = 0, bb = 0;
for (let x = 0; x < width; x++) {
  const idx = ((height - 1) * width + x) * 3;
  br += out[idx]; bg += out[idx + 1]; bb += out[idx + 2];
}
const bottomColor = toHex({ r: Math.round(br / width), g: Math.round(bg / width), b: Math.round(bb / width) });

writeFileSync(OUT_DATA, JSON.stringify({ bottomColor }, null, 2) + '\n');

const { statSync } = await import('node:fs');
const sizeKB = (statSync(OUT_WEBP).size / 1024).toFixed(1);
console.log(`wrote ${OUT_WEBP} (${sizeKB}KB), bottomColor=${bottomColor}`);
if (Number(sizeKB) > 40) {
  console.warn(`warning: output exceeds the 40KB budget (addendum CR-16 requirement 8)`);
}
