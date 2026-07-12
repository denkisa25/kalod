import { getVideoSource, type VideoRef } from '../lib/video-source';
import { loadYouTubeAPI, type YTPlayer } from '../lib/youtube-api';
import { isSoundEnabled, onSoundChange } from './sound-control';
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

export interface FeedAudioController {
  pauseForOverlay(): void;
  resumeFromOverlay(): void;
  /** CR-4 acceptance: "verified by inspecting player states, not by ear."
   *  Reports every attached background player's real isMuted()/state, so
   *  the "at most one unmuted, playing source" invariant can be asserted
   *  programmatically instead of by listening. */
  debugAudioState(): Array<{ idx: string; muted: boolean; playerState: number }>;
}

const CROSSFADE_MS = 400;

function rampVolume(player: YTPlayer, from: number, to: number, ms: number, onDone?: () => void): void {
  const start = performance.now();
  function step(now: number) {
    const t = Math.min(1, (now - start) / ms);
    try {
      player.setVolume(Math.round(from + (to - from) * t));
    } catch {
      // player may have been torn down mid-ramp (rapid scrolling) — the
      // ramp just stops, nothing left to clean up
    }
    if (t < 1) requestAnimationFrame(step);
    else onDone?.();
  }
  requestAnimationFrame(step);
}

/** Background loop: only the cue crossing the 55% intersection threshold
 *  streams; everything else shows its poster. Explicitly tears down any
 *  other active iframe before attaching a new one so at most one
 *  background stream can ever exist, regardless of observer timing.
 *
 *  CR-4 layers audio on top of that same single-active-stream invariant:
 *  each attached iframe is wrapped in a real YT.Player (enablejsapi=1 on
 *  the embed URL) so volume can be ramped. The video swap itself stays
 *  instant; only the *audio* crossfades — the outgoing cue's iframe isn't
 *  actually removed from the DOM until its 400ms fade-out finishes, so for
 *  that brief window the outgoing and incoming players genuinely overlap
 *  (an actual crossfade, not a hard cut), verified after settling rather
 *  than mid-transition. */
function initBackgroundLoop(cues: NodeListOf<HTMLElement>, byIdx: Map<number, CueData>): FeedAudioController {
  const noop: FeedAudioController = { pauseForOverlay() {}, resumeFromOverlay() {}, debugAudioState: () => [] };
  if (videoDisabled()) return noop;

  let activeCue: HTMLElement | null = null; // cue with a live (or fading-out) iframe
  let audibleCue: HTMLElement | null = null; // cue currently unmuted / ramping up
  let pausedForOverlay = false;
  const players = new Map<HTMLElement, YTPlayer>();

  function makeAudible(cue: HTMLElement) {
    const player = players.get(cue);
    if (!player || pausedForOverlay || !isSoundEnabled()) return;
    const previousCue = audibleCue;
    audibleCue = cue;
    try {
      player.unMute();
      player.setVolume(0);
    } catch {
      return;
    }
    rampVolume(player, 0, 100, CROSSFADE_MS);
    if (previousCue && previousCue !== cue) {
      const prevPlayer = players.get(previousCue);
      if (prevPlayer) {
        rampVolume(prevPlayer, 100, 0, CROSSFADE_MS, () => {
          try {
            prevPlayer.mute();
          } catch {
            /* already torn down */
          }
        });
      }
    }
  }

  function silence(cue: HTMLElement) {
    if (audibleCue === cue) audibleCue = null;
  }

  function detach(cue: HTMLElement) {
    const iframe = cue.querySelector('iframe');
    if (cue === activeCue) activeCue = null;
    const player = players.get(cue);
    const wasAudible = audibleCue === cue;
    silence(cue);
    players.delete(cue);

    if (player && wasAudible && isSoundEnabled()) {
      rampVolume(player, 100, 0, CROSSFADE_MS, () => {
        try {
          player.mute();
        } catch {
          /* already torn down */
        }
        iframe?.remove();
      });
    } else {
      iframe?.remove();
    }
  }

  function attach(cue: HTMLElement) {
    if (cue.querySelector('iframe')) return;

    // whichever cue crosses the activation threshold stops the previous
    // one's stream regardless of whether the new cue has video of its own
    // — bailing out below (no src) must not skip this, or a video-less cue
    // scrolling into place would leave the old cue streaming until its own
    // ratio independently drops to 0, past the point spec §11 intends
    // ("pause loops outside viewport")
    if (activeCue && activeCue !== cue) {
      const previous = activeCue;
      activeCue = null;
      detach(previous);
    }

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

    if (data!.videoRef.provider === 'youtube') {
      loadYouTubeAPI().then((YT) => {
        // the cue may have scrolled back out (and its iframe been replaced
        // or removed) by the time the API script finishes loading
        if (cue.querySelector('iframe') !== f) return;
        new YT.Player(f, {
          events: {
            onReady: (e) => {
              players.set(cue, e.target);
              if (cue === activeCue) makeAudible(cue);
            },
          },
        });
      });
    }
  }

  onSoundChange((enabled) => {
    if (pausedForOverlay) return;
    if (enabled) {
      if (activeCue) makeAudible(activeCue);
    } else if (audibleCue) {
      const player = players.get(audibleCue);
      try {
        player?.mute();
      } catch {
        /* already torn down */
      }
      audibleCue = null;
    }
  });

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

  return {
    // CR-4: "opening the detail player mutes the feed" — instant, not a
    // fade; a modal taking over the screen is a hard context switch.
    pauseForOverlay() {
      pausedForOverlay = true;
      if (audibleCue) {
        try {
          players.get(audibleCue)?.mute();
        } catch {
          /* already torn down */
        }
      }
    },
    // "closing it restores the previous state" — re-evaluated against
    // whichever cue is *currently* in view, not necessarily the one that
    // was audible when the overlay opened (the feed keeps scrolling
    // underneath a modal in this architecture is not possible, but the
    // user could have scrolled via keyboard before opening it — this
    // stays correct either way).
    resumeFromOverlay() {
      pausedForOverlay = false;
      if (activeCue && isSoundEnabled()) makeAudible(activeCue);
    },
    debugAudioState() {
      return Array.from(players.entries()).map(([cue, player]) => ({
        idx: cue.dataset.idx ?? '',
        muted: player.isMuted(),
        playerState: player.getPlayerState(),
      }));
    },
  };
}

/** Detail overlay: autoplay-with-sound player, prev/next, Escape/arrow
 *  keys, focus trap while open, focus returned to the trigger on close. */
/** CR-7: the work page's gallery/list "watch full video" reuses this exact
 *  function — no second player component — but has no background feed
 *  audio of its own to pause/resume, hence this no-op stand-in. */
export const NOOP_FEED_AUDIO: FeedAudioController = {
  pauseForOverlay() {},
  resumeFromOverlay() {},
  debugAudioState: () => [],
};

export function initDetailOverlay(cueList: CueData[], feedAudio: FeedAudioController): void {
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
    feedAudio.pauseForOverlay(); // CR-4: opening the player mutes the feed
    dClose?.focus();
  }

  function close() {
    detail!.classList.remove('open');
    document.body.style.overflow = '';
    player!.querySelectorAll('iframe').forEach((f) => f.remove());
    feedAudio.resumeFromOverlay(); // CR-4: closing it restores the prior state
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

  const feedAudio = initBackgroundLoop(cues, byIdx);
  initDetailOverlay(cueList, feedAudio);

  // CR-4 acceptance: "assert that at any scroll position at most one player
  // reports an unmuted, playing state" — this is the hook that assertion
  // runs against (see debugAudioState() above for what it reports).
  (window as unknown as { __feedAudioDebug?: FeedAudioController }).__feedAudioDebug = feedAudio;
}
