import { CUE_ACTIVE_THRESHOLD } from '../lib/format';

/** Homepage cue feed: role filters + rail active-state.
 *  No video/audio here — Session 2 adds the IntersectionObserver-driven
 *  video loader on top of this same markup. */
export function initFeedInteractions(): void {
  const filters = document.querySelectorAll<HTMLButtonElement>('.filter');
  const cues = document.querySelectorAll<HTMLElement>('.cue');
  // desktop side rail (≥768px) and mobile bottom progress line (<768px,
  // docs/design/mobile-rail.png) share the same active/filtered state
  const railLinks = document.querySelectorAll<HTMLAnchorElement>('#rail a, #mobileRail a');

  // grouped once so applyFilter() doesn't re-query the DOM per cue on
  // every filter click — each idx maps to one #rail link + one #mobileRail link
  const railByIdx = new Map<string, HTMLAnchorElement[]>();
  railLinks.forEach((r) => {
    const idx = r.dataset.idx ?? '';
    const group = railByIdx.get(idx);
    if (group) group.push(r);
    else railByIdx.set(idx, [r]);
  });

  const empty = document.getElementById('feedEmpty');

  function applyFilter(want: string | undefined): void {
    let visible = 0;
    cues.forEach((cue) => {
      const roles = (cue.dataset.roles ?? '').split(',');
      const ok = want === 'all' || roles.includes(want ?? '');
      if (ok) visible++;
      cue.classList.toggle('hidden', !ok);
      railByIdx.get(cue.dataset.idx ?? '')?.forEach((rail) => { rail.style.display = ok ? '' : 'none'; });
    });
    if (empty) empty.hidden = visible > 0;
  }

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.forEach((f) => f.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      applyFilter(btn.dataset.f);
    });
  });

  empty?.querySelector('button')?.addEventListener('click', () => {
    const allBtn = document.querySelector<HTMLButtonElement>('.filter[data-f="all"]');
    allBtn?.click();
  });

  if ('IntersectionObserver' in window && cues.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= CUE_ACTIVE_THRESHOLD) {
            const idx = (entry.target as HTMLElement).dataset.idx;
            railLinks.forEach((r) => r.classList.toggle('active', r.dataset.idx === idx));
          }
        });
      },
      { threshold: [0, CUE_ACTIVE_THRESHOLD] },
    );
    cues.forEach((cue) => io.observe(cue));
  }
}
