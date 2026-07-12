/** Reads a resolved CSS custom property from the document root — mirrors
 *  the reference file's `css(v)` helper so the opener never hardcodes a
 *  brand value; it reads whatever spec §3 tokens are live on the page. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** "#1982d1" -> "25,130,209", for building rgba() strings in canvas draws
 *  (canvas fillStyle/strokeStyle can't reference CSS custom properties). */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
