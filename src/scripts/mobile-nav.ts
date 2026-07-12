import { trapTabKey } from '../lib/focus-trap';

/** Mobile hamburger nav: fullscreen overlay, focus-trapped while open,
 *  Escape closes, focus returns to the trigger. Header stays a sibling
 *  above the overlay in z-index (not nested inside it) so the brand/close
 *  controls are always visible and clickable by construction — the
 *  nested-in-header stacking bug noted in docs/design/README.md doesn't
 *  apply to this structure. */
export function initMobileNav(): void {
  const toggle = document.getElementById('navToggle');
  const panel = document.getElementById('mobileNav');
  if (!toggle || !panel) return;

  let open = false;
  let lastFocus: HTMLElement | null = null;

  function focusable(): HTMLElement[] {
    return Array.from(panel!.querySelectorAll<HTMLElement>('a[href]'));
  }

  function setOpen(next: boolean): void {
    open = next;
    toggle!.setAttribute('aria-expanded', String(open));
    toggle!.setAttribute('aria-label', open ? 'close menu' : 'open menu');
    panel!.setAttribute('aria-hidden', String(!open));
    panel!.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);

    if (open) {
      lastFocus = document.activeElement as HTMLElement;
      focusable()[0]?.focus();
    } else {
      lastFocus?.focus();
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));

  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName === 'A') setOpen(false);
  });

  addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    trapTabKey(e, [toggle!, ...focusable()]);
  });

  addEventListener('resize', () => {
    if (open && innerWidth >= 768) setOpen(false);
  });
}
