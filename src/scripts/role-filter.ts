/** CR-6 — ONE shared filter implementation for the home feed, the work
 *  list, and the work gallery. No surface re-implements role matching or
 *  URL sync independently; they all just point this at their own set of
 *  [data-roles] items and (optionally) an empty-state block. */

function roleFromURL(): string {
  return new URLSearchParams(location.search).get('role') ?? 'all';
}

function writeRoleToURL(role: string): void {
  const url = new URL(location.href);
  if (role === 'all') url.searchParams.delete('role');
  else url.searchParams.set('role', role);
  history.pushState({ role }, '', url);
}

export interface RoleFilterOptions {
  /** elements carrying a comma-separated data-roles attribute */
  items: NodeListOf<HTMLElement>;
  emptyState?: HTMLElement | null;
  /** called after every filter pass (initial load, click, or popstate) —
   *  callers read items' resulting .hidden state rather than re-deriving
   *  role matches themselves (e.g. the home feed's rail active-link sync). */
  onApplied?: (role: string) => void;
}

export function initRoleFilter({ items, emptyState, onApplied }: RoleFilterOptions): void {
  const filters = document.querySelectorAll<HTMLButtonElement>('.filter');

  function apply(role: string, pushState: boolean): void {
    let visible = 0;
    items.forEach((item) => {
      const roles = (item.dataset.roles ?? '').split(',');
      const ok = role === 'all' || roles.includes(role);
      if (ok) visible++;
      item.classList.toggle('hidden', !ok);
    });
    if (emptyState) emptyState.hidden = visible > 0;
    filters.forEach((f) => f.setAttribute('aria-pressed', String(f.dataset.f === role)));
    if (pushState) writeRoleToURL(role);
    onApplied?.(role);
  }

  filters.forEach((btn) => {
    btn.addEventListener('click', () => apply(btn.dataset.f ?? 'all', true));
  });

  emptyState?.querySelector('button')?.addEventListener('click', () => apply('all', true));

  // linkable filtered views (?role=mix) and back-button restoration
  addEventListener('popstate', () => apply(roleFromURL(), false));
  apply(roleFromURL(), false);
}
