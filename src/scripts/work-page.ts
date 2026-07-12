import { initRoleFilter } from './role-filter';

const VIEW_KEY = 'kd-work-view';
const MAX_CONCURRENT_PREVIEWS = 2;

/** CR-7: list ⇄ gallery, remembered for the session. Both views are always
 *  server-rendered and already filter-synced (see initWorkPage) — switching
 *  is a pure visibility toggle, no re-render, no re-filtering. */
function initViewSwitch(): void {
  const list = document.getElementById('workList');
  const gallery = document.getElementById('workGallery');
  const buttons = document.querySelectorAll<HTMLButtonElement>('.view-switch button');
  if (!list || !gallery) return;

  function setView(view: string, persist: boolean): void {
    list!.hidden = view !== 'list';
    gallery!.hidden = view !== 'gallery';
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (persist) sessionStorage.setItem(VIEW_KEY, view);
  }

  buttons.forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view ?? 'list', true));
  });

  setView(sessionStorage.getItem(VIEW_KEY) === 'gallery' ? 'gallery' : 'list', false);
}

function previewsDisabled(): boolean {
  return (
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    matchMedia('(prefers-reduced-data: reduce)').matches
  );
}

/** CR-7: hover (or, on touch, whichever tile sits nearest viewport center)
 *  cross-fades in the tile's second poster frame — capped at 2 concurrent,
 *  disabled entirely under reduced-motion/reduced-data (static posters only). */
function initGalleryPreviews(): void {
  const tiles = document.querySelectorAll<HTMLElement>('.gallery-tile');
  if (!tiles.length || previewsDisabled()) return;

  const active = new Set<HTMLElement>();

  function start(tile: HTMLElement): void {
    if (active.has(tile) || active.size >= MAX_CONCURRENT_PREVIEWS) return;
    active.add(tile);
    tile.classList.add('previewing');
  }
  function stop(tile: HTMLElement): void {
    active.delete(tile);
    tile.classList.remove('previewing');
  }

  tiles.forEach((tile) => {
    tile.addEventListener('mouseenter', () => start(tile));
    tile.addEventListener('mouseleave', () => stop(tile));
  });

  if (matchMedia('(hover: none)').matches) {
    let current: HTMLElement | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const tile = best.target as HTMLElement;
        if (tile === current) return;
        if (current) stop(current);
        start(tile);
        current = tile;
      },
      { threshold: [0.5, 0.75, 1] },
    );
    tiles.forEach((t) => io.observe(t));
  }
}

export function initWorkPage(): void {
  initViewSwitch();
  initRoleFilter({
    items: document.querySelectorAll<HTMLElement>('.work-row, .gallery-tile'),
    emptyState: document.getElementById('workEmpty'),
  });
  initGalleryPreviews();
}
