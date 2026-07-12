import { getVideoSource, type VideoRef } from '../lib/video-source';
import { pad, roleLine, CUE_ACTIVE_THRESHOLD, type Role } from '../lib/format';
import { trapTabKey } from '../lib/focus-trap';

export interface CueData {
  idx: number;
  slug: string;
  title: string;
  kind: string;
  roles: Role[];
  client: string;
  excerpt: string;
  videoRef: VideoRef;
}

const $ = <T extends Element = Element>(sel: string, el: ParentNode = document) =>
  el.querySelector<T>(sel);

/** reduced-motion, reduced-data, or file:// — never attach an iframe;
 *  posters (already ken-burns'd via CSS) are the whole experience. */
function videoDisabled(): boolean {
  return (
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    matchMedia('(prefers-reduced-data: reduce)').matches ||
    location.protocol === 'file:'
  );
}

/** Background loop: only the cue crossing the 55% intersection threshold
 *  streams; everything else shows its poster. Explicitly tears down any
 *  other active iframe before attaching a new one so at most one
 *  background stream can ever exist, regardless of observer timing. */
function initBackgroundLoop(cues: NodeListOf<HTMLElement>, byIdx: Map<number, CueData>): void {
  if (videoDisabled()) return;

  let activeCue: HTMLElement | null = null;

  function detach(cue: HTMLElement) {
    cue.querySelector('iframe')?.remove();
    if (cue === activeCue) activeCue = null;
  }

  function attach(cue: HTMLElement) {
    if (cue.querySelector('iframe')) return;

    // whichever cue crosses the activation threshold stops the previous
    // one's stream regardless of whether the new cue has video of its own
    // — bailing out below (no src) must not skip this, or a video-less cue
    // scrolling into place would leave the old cue streaming until its own
    // ratio independently drops to 0, past the point spec §11 intends
    // ("pause loops outside viewport")
    if (activeCue && activeCue !== cue) detach(activeCue);

    const data = byIdx.get(Number(cue.dataset.idx));
    const source = data && getVideoSource(data.videoRef);
    const src = source?.getBackgroundEmbed(data!.videoRef);
    if (!src) return;

    const f = document.createElement('iframe');
    f.src = src;
    f.allow = 'autoplay; encrypted-media';
    f.title = `${data!.title} — background`;
    f.addEventListener('load', () => setTimeout(() => f.classList.add('on'), 350));
    cue.querySelector('.bgwrap')?.appendChild(f);
    activeCue = cue;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const cue = entry.target as HTMLElement;
        if (entry.isIntersecting && entry.intersectionRatio >= CUE_ACTIVE_THRESHOLD) {
          attach(cue);
        } else if (!entry.isIntersecting && cue === activeCue) {
          detach(cue);
        }
      });
    },
    { threshold: [0, CUE_ACTIVE_THRESHOLD] },
  );
  cues.forEach((cue) => io.observe(cue));
}

/** Detail overlay: autoplay-with-sound player, prev/next, Escape/arrow
 *  keys, focus trap while open, focus returned to the trigger on close. */
function initDetailOverlay(cueList: CueData[]): void {
  const detail = $('#detail');
  const player = $('#player');
  if (!detail || !player) return;

  // these are all static elements inside #detail that never leave the DOM
  // across a render() — only their text/visibility changes — so they're
  // queried once here instead of on every open/prev/next/arrow-key call
  const dCount = $<HTMLElement>('#dCount')!;
  const dKind = $<HTMLElement>('#dKind')!;
  const dName = $<HTMLElement>('#dName')!;
  const dRoles = $<HTMLElement>('#dRoles')!;
  const dClient = $<HTMLElement>('#dClient')!;
  const dNote = $<HTMLElement>('#dNote')!;
  const dClose = $<HTMLElement>('#dClose');
  const eyebrow = $<HTMLElement>('#dEyebrow');
  const ph = $<HTMLElement>('.ph', player);
  const skeleton = $<HTMLElement>('.skeleton', player);

  const noVideo = videoDisabled();
  let current = 0;
  let lastFocus: HTMLElement | null = null;

  function focusable(): HTMLElement[] {
    return Array.from(detail!.querySelectorAll<HTMLElement>('button, a[href]'));
  }

  function render(i: number) {
    current = ((i % cueList.length) + cueList.length) % cueList.length;
    const p = cueList[current];
    dCount.textContent = `cue ${pad(current + 1)} / ${pad(cueList.length)}`;
    dKind.textContent = p.kind;
    dName.textContent = p.title;
    dRoles.textContent = roleLine(p.roles);
    dClient.textContent = p.client;
    dNote.textContent = p.excerpt;

    player!.querySelectorAll('iframe').forEach((f) => f.remove());
    const source = getVideoSource(p.videoRef);
    const src = !noVideo ? source?.getPlayerEmbed(p.videoRef) : null;

    // eyebrow communicates a missing video specifically (VideoSource has no
    // provider for this project) — distinct from the reduced-motion/data
    // preference case, which the placeholder text below covers instead
    if (eyebrow) eyebrow.hidden = p.videoRef.provider !== null;

    if (src) {
      if (ph) ph.style.display = 'none';
      if (skeleton) skeleton.style.display = 'flex';
      const f = document.createElement('iframe');
      f.src = src;
      f.allow = 'autoplay; fullscreen; encrypted-media';
      f.title = p.title;
      f.addEventListener('load', () => {
        if (skeleton) skeleton.style.display = 'none';
      });
      player!.appendChild(f);
    } else {
      if (skeleton) skeleton.style.display = 'none';
      if (ph) {
        ph.style.display = 'grid';
        ph.textContent = noVideo
          ? 'video disabled — reduced motion/data preference'
          : 'video pending — client to supply link';
      }
    }
  }

  function open(i: number, trigger: HTMLElement | null) {
    if (!detail!.classList.contains('open')) lastFocus = trigger ?? (document.activeElement as HTMLElement);
    render(i);
    detail!.classList.add('open');
    document.body.style.overflow = 'hidden';
    dClose?.focus();
  }

  function close() {
    detail!.classList.remove('open');
    document.body.style.overflow = '';
    player!.querySelectorAll('iframe').forEach((f) => f.remove());
    lastFocus?.focus();
  }

  dClose?.addEventListener('click', close);
  $('#dPrev')?.addEventListener('click', () => render(current - 1));
  $('#dNext')?.addEventListener('click', () => render(current + 1));

  document.querySelectorAll<HTMLElement>('.watch[data-idx]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open(Number(el.dataset.idx), el);
    });
  });

  addEventListener('keydown', (e) => {
    if (!detail!.classList.contains('open')) return;
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowLeft') render(current - 1);
    if (e.key === 'ArrowRight') render(current + 1);
    trapTabKey(e, focusable());
  });
}

export function initVideoLayer(): void {
  const dataEl = document.getElementById('cue-data');
  if (!dataEl) return;
  const cueList = JSON.parse(dataEl.textContent ?? '[]') as CueData[];
  const byIdx = new Map(cueList.map((c) => [c.idx, c]));
  const cues = document.querySelectorAll<HTMLElement>('.cue[data-idx]');

  initBackgroundLoop(cues, byIdx);
  initDetailOverlay(cueList);
}
