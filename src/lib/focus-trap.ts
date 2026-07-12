/** Shared Tab-cycling logic for focus-trapped overlays (mobile nav, detail
 *  overlay). Previously hand-rolled identically in both — a future a11y fix
 *  (e.g. handling zero focusable items) only needs to land once now. Each
 *  caller still owns its own `items` list (the elements to trap Tab within)
 *  since that differs per overlay. */
export function trapTabKey(e: KeyboardEvent, items: HTMLElement[]): void {
  if (e.key !== 'Tab' || items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
