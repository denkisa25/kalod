import { CUE_ACTIVE_THRESHOLD } from '../lib/format';
import { initRoleFilter } from './role-filter';

/** Homepage cue feed: role filters (CR-6: shared implementation, see
 *  role-filter.ts) + rail active-state. No video/audio here — Session 2
 *  adds the IntersectionObserver-driven video loader on top of this same
 *  markup. */
export function initFeedInteractions(): void {
  const cues = document.querySelectorAll<HTMLElement>('.cue');
  // desktop side rail (≥768px) and mobile bottom progress line (<768px,
  // docs/design/mobile-rail.png) share the same active/filtered state
  const railLinks = document.querySelectorAll<HTMLAnchorElement>('#rail a, #mobileRail a');

  // grouped once so filter changes don't re-query the DOM per cue —
  // each idx maps to one #rail link + one #mobileRail link
  const railByIdx = new Map<string, HTMLAnchorElement[]>();
  railLinks.forEach((r) => {
    const idx = r.dataset.idx ?? '';
    const group = railByIdx.get(idx);
    if (group) group.push(r);
    else railByIdx.set(idx, [r]);
  });

  initRoleFilter({
    items: cues,
    emptyState: document.getElementById('feedEmpty'),
    // the rail isn't itself a filterable item — it just mirrors whichever
    // cues the shared filter already hid, rather than re-deriving role
    // matches independently (that duplication is exactly what CR-6 rules out)
    onApplied: () => {
      cues.forEach((cue) => {
        const hidden = cue.classList.contains('hidden');
        railByIdx.get(cue.dataset.idx ?? '')?.forEach((rail) => { rail.style.display = hidden ? 'none' : ''; });
      });
    },
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
