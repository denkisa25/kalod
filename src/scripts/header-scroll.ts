/** CR-3/D1 — the home page's header starts large-and-centered (.header--hero)
 *  and shrinks to a medium centered mark with right-aligned nav
 *  (.header--compact) once the user scrolls past cue 01. Internal pages
 *  render .header--compact server-side and never call this (no #cue-0 to
 *  observe), so it's a no-op there. */
export function initHeaderScroll(): void {
  const header = document.querySelector('header.header--hero') as HTMLElement | null;
  const cue0 = document.getElementById('cue-0');
  if (!header || !cue0) return;

  const io = new IntersectionObserver(
    ([entry]) => {
      header.classList.toggle('header--hero', entry.isIntersecting);
      header.classList.toggle('header--compact', !entry.isIntersecting);
    },
    { threshold: 0 },
  );
  io.observe(cue0);
}
