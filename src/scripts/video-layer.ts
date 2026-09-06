import { getVideoSource, type VideoRef } from '../lib/video-source';
import { loadYouTubeAPI, type YTPlayer } from '../lib/youtube-api';
import { adaptVideoElement, onVideoReady } from '../lib/native-video-player';
import { attachVideoSource } from '../lib/hls-source';
import { isSoundEnabled, onSoundChange } from './sound-control';
import { initPlayerControls } from './player-controls';
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

/** How long to wait before checking that unmuting did not cost us playback.
 *  Long enough for WebKit to have acted, short enough that a visitor does not
 *  sit looking at a stalled poster. */
const UNMUTE_VERIFY_MS = 350;
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

  // Start fetching the IFrame API immediately instead of waiting for the
  // IntersectionObserver's first callback to fire attach() for cue 01 — by
  // the time that callback runs (an async task, not instant), the script is
  // already in flight. loadYouTubeAPI() caches its promise, so this is free
  // for every cue that attaches later.
  if (cues.length > 0 && byIdx.size > 0) loadYouTubeAPI();

  // Only IFRAME-backed cues ever had the problem this guards against. iOS is
  // unreliable about muted autoplay for a cross-origin iframe attached
  // programmatically on scroll, and shows YouTube's own paused/play-button
  // state when it refuses (cr-002-mobile-playback-qa.md finding 1), so the
  // first cue got a real attempt and later ones were skipped rather than
  // rendering that broken-looking fallback.
  //
  // A native <video> from Cloudflare Stream has no such failure mode: muted
  // autoplay on iOS is reliable for a real media element. Post-CR-003 every
  // home cue is native, so this is dormant there — it stays for /work detail
  // pages and any project still on YouTube. Applying it to native video was
  // suppressing playback that works, which is why cues 02-10 never started
  // on mobile.
  const iframeTouchLimit = matchMedia('(pointer: coarse)').matches;
  let iframeAttempted = false;

  let activeCue: HTMLElement | null = null; // cue with a live (or fading-out) iframe
  let audibleCue: HTMLElement | null = null; // cue currently unmuted / ramping up
  let pausedForOverlay = false;
  const players = new Map<HTMLElement, YTPlayer>();
  /** HLS teardown per cue. An Hls instance left alive keeps fetching segments
   *  for a cue that has scrolled away, which is exactly the bandwidth this
   *  whole change exists to save. */
  const mediaTeardowns = new Map<HTMLElement, () => void>();
  /** Cues with a LIVE attachment. DOM presence is not the same thing: an
   *  element sits in the DOM for the length of the audio crossfade after
   *  detach, and a cue whose HLS import was cancelled keeps an empty <video>.
   *  Inferring health from querySelector treated both as healthy and refused
   *  to re-attach, which is what left cues stuck on their posters. */
  const attached = new Set<HTMLElement>();

  /** Match YouTube's PlayerState values, which native-video-player.ts's
   *  adapter deliberately agrees with. ENDED 0, PLAYING 1, PAUSED 2,
   *  BUFFERING 3. */
  const PAUSED = 2;

  function makeAudible(cue: HTMLElement) {
    const player = players.get(cue);
    if (!player || pausedForOverlay || !isSoundEnabled()) return;
    try {
      player.unMute();
      player.setVolume(0);
    } catch {
      // new player isn't actually working — leave audibleCue/the previous
      // cue's audio untouched instead of "succeeding" into a broken state
      // (found by code review: this used to reassign audibleCue before
      // the try, stranding the old cue audible forever if this threw)
      return;
    }
    const previousCue = audibleCue;
    audibleCue = cue;
    rampVolume(player, 0, 100, CROSSFADE_MS);

    // iOS/WebKit PAUSES a media element that becomes unmuted without a fresh
    // user gesture. The tap on the sound control is a gesture for whichever
    // cue is playing at that moment, but every cue scrolled to afterwards is a
    // brand-new element that never received one — so unmuting it silently
    // stopped playback, leaving the poster on screen. That is both halves of
    // the reported fault: frozen picture AND no sound, from one cause.
    //
    // Playback is the thing that must never be sacrificed. If unmuting cost us
    // the picture, go back to muted and resume; the visitor keeps a running
    // feed and gets audio on the cue they actually tapped, which is the most
    // any platform permits (cr-002-mobile-playback-qa.md finding 4).
    setTimeout(() => {
      if (players.get(cue) !== player) return;
      let state: number;
      try {
        state = player.getPlayerState();
      } catch {
        return;
      }
      // ONLY a hard pause means WebKit refused the unmute. The first version
      // of this check treated anything that was not PLAYING as failure, which
      // swept in BUFFERING — and unmuting an HLS stream routinely buffers for
      // a moment while it fetches the audio track. So it re-muted cues that
      // were about to play with sound, turning "frozen, no audio" into
      // "playing, no audio". Buffering is normal; leave it alone.
      if (state !== PAUSED) return;
      try {
        player.mute();
      } catch {
        return;
      }
      if (audibleCue === cue) audibleCue = null;
      player.playVideo();
    }, UNMUTE_VERIFY_MS);
    if (previousCue && previousCue !== cue) {
      const prevPlayer = players.get(previousCue);
      if (prevPlayer) {
        const startVolume = prevPlayer.getVolume();
        rampVolume(prevPlayer, startVolume, 0, CROSSFADE_MS, () => {
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
    const media = cue.querySelector('iframe, video');
    if (cue === activeCue) activeCue = null;
    const player = players.get(cue);
    const wasAudible = audibleCue === cue;
    silence(cue);
    // Marked dead NOW, not when the fade finishes — otherwise a scroll back
    // during the crossfade sees a live cue and declines to re-attach.
    attached.delete(cue);
    // Captured so the deferred cleanup below can tell whether it is tidying
    // up its OWN attachment or has been overtaken by a newer one.
    const teardown = mediaTeardowns.get(cue);

    if (player && wasAudible && isSoundEnabled()) {
      // players.delete() waits until the fade actually finishes (not
      // synchronously here) — CR-4's debugAudioState() reads this map, and
      // an outgoing player deleted from it mid-fade would let the
      // "at most one unmuted" invariant go unverified during the exact
      // window a real crossfade briefly has two audible sources (found by
      // code review). Read the player's actual current volume as the
      // ramp's start, not a hardcoded 100 — a detach() that interrupts an
      // in-progress fade-in would otherwise jump volume up before ramping
      // it back down.
      const startVolume = player.getVolume();
      rampVolume(player, startVolume, 0, CROSSFADE_MS, () => {
        try {
          player.mute();
        } catch {
          /* already torn down */
        }
        // If the visitor scrolled back during the fade, attach() has already
        // replaced these. Deleting unconditionally would strip the NEW
        // attachment's player and teardown and strand it.
        if (players.get(cue) === player) players.delete(cue);
        if (teardown && mediaTeardowns.get(cue) === teardown) {
          teardown();
          mediaTeardowns.delete(cue);
        }
        media?.remove();
        // Safety net for a cue left visible with nothing playing, because the
        // observer will not fire again when the ratio never re-crossed the
        // threshold.
        //
        // The activeCue === null guard is load-bearing and was missing in the
        // first version of this, which regressed every cue to a frozen first
        // frame with no audio. Without it, a cue still ≥55% visible when its
        // own fade-out completed would re-attach and detach whichever cue had
        // legitimately taken over — that cue's fade would then complete and
        // revive it in turn, ping-ponging forever and tearing down each
        // element before it could start. Revive only when nothing else holds
        // the single active stream.
        if (activeCue === null && !attached.has(cue) && isCueActive(cue)) attach(cue);
      });
    } else {
      if (players.get(cue) === player) players.delete(cue);
      if (teardown && mediaTeardowns.get(cue) === teardown) {
        teardown();
        mediaTeardowns.delete(cue);
      }
      media?.remove();
    }
  }

  /** Is this cue currently occupying enough of the viewport to deserve the
   *  one active stream? Mirrors the IntersectionObserver's own threshold. */
  function isCueActive(cue: HTMLElement): boolean {
    const r = cue.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return r.height > 0 && visible / r.height >= CUE_ACTIVE_THRESHOLD;
  }

  function attach(cue: HTMLElement) {
    if (attached.has(cue)) return;

    // Something is in the DOM but not live: either mid-crossfade teardown, or
    // a <video> whose source never arrived because its import was cancelled.
    // Clear it out and start fresh rather than bailing — bailing is what left
    // the cue showing a poster with no way back.
    const stale = cue.querySelector('iframe, video');
    if (stale) {
      mediaTeardowns.get(cue)?.();
      mediaTeardowns.delete(cue);
      players.delete(cue);
      stale.remove();
    }

    // whichever cue crosses the activation threshold stops the previous
    // one's stream regardless of whether the new cue has video of its own
    // — bailing out below (no spec) must not skip this, or a video-less cue
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
    const spec = source?.getBackgroundEmbed(data!.videoRef);
    if (!spec) return;

    // Checked after the spec resolves, so it can see which KIND of embed this
    // is — the whole point of scoping it to iframes.
    if (spec.kind === 'iframe') {
      if (iframeTouchLimit && iframeAttempted) return;
      iframeAttempted = true;
    }

    const bgwrap = cue.querySelector('.bgwrap');
    activeCue = cue;

    // Cloudflare Stream (migrated projects, docs/video-migration-guide.md):
    // a real <video> element — no iframe, so none of the cross-origin
    // autoplay unreliability from cr-002-mobile-playback-qa.md applies.
    // adaptVideoElement() lets this share every bit of makeAudible()/
    // rampVolume()/debugAudioState() above unchanged.
    if (spec.kind === 'video') {
      const v = document.createElement('video');
      // ORDER MATTERS on iOS. muted and playsinline must be set BEFORE src, so
      // the element already qualifies for the muted-autoplay exemption at the
      // moment WebKit starts loading. Assigning src first and muting after is
      // a documented way to have iOS refuse autoplay outright.
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.autoplay = true;
      // HLS where it can be played, MP4 otherwise — see hls-source.ts. Still
      // assigned before the poster/preload lines below for the same iOS
      // reason the muted/playsinline ordering exists.
      mediaTeardowns.set(cue, attachVideoSource(v, spec));
      v.setAttribute('aria-hidden', 'true');
      // the cue's own still, so a slow first segment shows the frame the
      // visitor is already looking at rather than a black box
      const still = cue.querySelector<HTMLImageElement>('img.poster');
      if (still?.currentSrc) v.poster = still.currentSrc;
      v.preload = 'auto';
      v.addEventListener('loadeddata', () => setTimeout(() => v.classList.add('on'), 350));
      // A source that fails (bad segment, dropped connection, a rendition the
      // device cannot decode) must release the cue, or the guard at the top of
      // attach() blocks every future attempt and it never recovers.
      v.addEventListener('error', () => {
        attached.delete(cue);
      });
      bgwrap?.appendChild(v);
      // Marked live at APPEND, not at loadedmetadata: between the two, a
      // second observer callback would otherwise attach a duplicate element.
      attached.add(cue);
      onVideoReady(v, () => {
        // the cue may have scrolled back out (and its <video> replaced or
        // removed) by the time metadata finishes loading
        if (cue.querySelector('video') !== v) return;
        players.set(cue, adaptVideoElement(v));
        // The autoplay ATTRIBUTE alone is unreliable for an element created
        // and inserted by script — iOS in particular often ignores it and
        // waits for an explicit request. The detail-overlay path has always
        // called play() for this reason; the feed path did not, which is why
        // cues past the first stayed on their poster on mobile even after the
        // touch guard stopped suppressing them. A rejection here is the
        // browser's autoplay policy, not an error worth surfacing.
        // One retry, and only one. iOS can reject this first request while it
        // is still settling the element even though the policy would allow it
        // a moment later — that transient rejection is a share of the cues
        // that "sometimes" stayed on their poster. Bounded deliberately: a
        // genuine policy refusal must not become a retry loop.
        let retried = false;
        const tryPlay = () => {
          v.play().catch(() => {
            if (retried || cue !== activeCue) return;
            retried = true;
            v.addEventListener('canplay', () => {
              if (v.paused && cue === activeCue) v.play().catch(() => {});
            }, { once: true });
          });
        };
        tryPlay();
        if (cue === activeCue) makeAudible(cue);
      });
      return;
    }

    const f = document.createElement('iframe');
    f.src = spec.src;
    f.allow = 'autoplay; encrypted-media';
    f.title = `${data!.title} — background`;
    f.addEventListener('load', () => setTimeout(() => f.classList.add('on'), 350));
    bgwrap?.appendChild(f);
    attached.add(cue);

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
  const ambient = $('.stage-ambient');
  if (!detail || !player) return;

  // these are all static elements inside #detail that never leave the DOM
  // across a render() — only their text/visibility changes — so they're
  // queried once here instead of on every open/prev/next/key call
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
  const controls = initPlayerControls();

  const noVideo = videoDisabled();
  let current = 0;
  let lastFocus: HTMLElement | null = null;
  let renderToken = 0; // invalidates a stale YT.Player onReady from a superseded render()

  function focusable(): HTMLElement[] {
    return Array.from(detail!.querySelectorAll<HTMLElement>('button, a[href], input'));
  }

  /** HLS teardowns for the overlay's own two <video> elements (the frame and
   *  CR-9's blurred ambient copy). Cleared on every render and on close, for
   *  the same segment-fetching reason as the feed's map. */
  let overlayTeardowns: Array<() => void> = [];
  function runOverlayTeardowns(): void {
    overlayTeardowns.forEach((fn) => fn());
    overlayTeardowns = [];
  }

  function render(i: number) {
    current = ((i % cueList.length) + cueList.length) % cueList.length;
    const p = cueList[current];
    const token = ++renderToken;
    dCount.textContent = `cue ${pad(current + 1)} / ${pad(cueList.length)}`;
    dKind.textContent = p.kind;
    dName.textContent = p.title;
    dRoles.textContent = roleLine(p.roles);
    dClient.textContent = p.client;
    dNote.textContent = p.excerpt;

    runOverlayTeardowns();
    player!.querySelectorAll('iframe, video').forEach((f) => f.remove());
    ambient?.querySelectorAll('iframe, video').forEach((f) => f.remove());
    controls.bindPlayer(null);
    const source = getVideoSource(p.videoRef);
    const spec = !noVideo ? source?.getPlayerEmbed(p.videoRef) : null;

    // eyebrow communicates a missing video specifically (VideoSource has no
    // provider for this project) — distinct from the reduced-motion/data
    // preference case, which the placeholder text below covers instead
    if (eyebrow) eyebrow.hidden = p.videoRef.provider !== null;

    // CR-8's custom transport is wired to a real player for YouTube and
    // Cloudflare (both drivable — see below); only Vimeo has no player
    // object behind it. Showing our controls over Vimeo's embed would
    // render a control bar that looks real but does nothing (found by code
    // review) — its own native controls are still present on that embed
    // (getPlayerEmbed doesn't set controls=0), so hiding ours just leaves
    // it controllable through its actual working chrome.
    detail!.classList.toggle('native-controls', p.videoRef.provider === 'vimeo');

    if (spec?.kind === 'video') {
      if (ph) ph.style.display = 'none';
      if (skeleton) skeleton.style.display = 'flex';
      const v = document.createElement('video');
      v.playsInline = true;
      v.autoplay = true;
      v.title = p.title;
      overlayTeardowns.push(attachVideoSource(v, spec));
      v.addEventListener('loadeddata', () => {
        if (skeleton) skeleton.style.display = 'none';
      });
      player!.appendChild(v);

      const ambientSpec = source?.getBackgroundEmbed(p.videoRef);
      if (ambient && ambientSpec?.kind === 'video') {
        const bg = document.createElement('video');
        bg.muted = true;
        bg.loop = true;
        bg.playsInline = true;
        bg.autoplay = true;
        // HLS here too, despite this copy being blurred to ~40px and dimmed to
        // 35% (CR-9) so rendition quality is invisible. The first instinct was
        // the MP4 — a second ABR session competes with the frame the viewer is
        // actually watching — but the MP4 is ONE fixed rendition, and on this
        // catalogue that means 61 MB for burkinabe-rising and 24 MB for
        // viktoria. Guaranteeing that download to avoid contention trades a
        // small problem for a much larger one. Adaptive on both lets each pick
        // something the connection can carry.
        overlayTeardowns.push(attachVideoSource(bg, ambientSpec));
        bg.setAttribute('aria-hidden', 'true');
        bg.tabIndex = -1;
        ambient.appendChild(bg);
      }

      onVideoReady(v, () => {
        if (token !== renderToken || player!.querySelector('video') !== v) return;
        controls.bindPlayer(adaptVideoElement(v));
        try {
          v.play();
        } catch {
          /* autoplay blocked — same browser policy as YouTube, not an error */
        }
      });
    } else if (spec?.kind === 'iframe') {
      if (ph) ph.style.display = 'none';
      if (skeleton) skeleton.style.display = 'flex';
      const f = document.createElement('iframe');
      f.src = spec.src;
      f.allow = 'autoplay; fullscreen; encrypted-media';
      f.title = p.title;
      f.addEventListener('load', () => {
        if (skeleton) skeleton.style.display = 'none';
      });
      player!.appendChild(f);

      // CR-9 — a muted, looping, chromeless copy of the same video for the
      // blurred ambient surround (getBackgroundEmbed, not getPlayerEmbed —
      // it must never carry a second audio source)
      const ambientSpec = source?.getBackgroundEmbed(p.videoRef);
      if (ambient && ambientSpec?.kind === 'iframe') {
        const bg = document.createElement('iframe');
        bg.src = ambientSpec.src;
        bg.allow = 'autoplay';
        bg.title = '';
        bg.setAttribute('aria-hidden', 'true');
        bg.tabIndex = -1;
        ambient.appendChild(bg);
      }

      if (p.videoRef.provider === 'youtube') {
        loadYouTubeAPI().then((YT) => {
          if (token !== renderToken || player!.querySelector('iframe') !== f) return;
          new YT.Player(f, {
            events: {
              onReady: (e) => {
                controls.bindPlayer(e.target);
                // Reinforces the embed URL's own autoplay=1 with an explicit
                // API call, in case the iframe's internal autoplay didn't
                // fire (e.g. it was still loading/navigating when this
                // resolved). Not a guaranteed fix for iOS's stricter
                // unmuted-autoplay policy — see cr-002-mobile-playback-qa.md
                // — but the standards-recommended way to maximize the odds,
                // and harmless if the video is already playing.
                try {
                  e.target.playVideo();
                } catch {
                  /* player not actually ready despite onReady — ignore */
                }
              },
            },
          });
        });
      }
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
    runOverlayTeardowns();
    renderToken++; // any in-flight loadYouTubeAPI().then() for this cue is now stale
    detail!.classList.remove('open');
    document.body.style.overflow = '';
    player!.querySelectorAll('iframe, video').forEach((f) => f.remove());
    ambient?.querySelectorAll('iframe, video').forEach((f) => f.remove());
    controls.bindPlayer(null);
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

  // gallery tiles open on a click anywhere on the tile, not just the "watch
  // full video" link — that link keeps its own listener above (for a11y /
  // right-click-open-in-new-tab), so skip here when the click originated on
  // it to avoid opening the same cue twice in one click.
  document.querySelectorAll<HTMLElement>('.gallery-tile[data-idx]').forEach((tile) => {
    tile.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.watch')) return;
      open(Number(tile.dataset.idx), tile);
    });
  });

  // CR-8 keyboard map: Space/←→/↑↓/M/? live in player-controls.ts (they
  // target playback, not this overlay's own navigation). N/P/Esc are the
  // overlay's own concerns — cue navigation and closing — so they stay here
  // alongside the focus trap.
  addEventListener('keydown', (e) => {
    if (!detail!.classList.contains('open')) return;
    // no INPUT-focus guard here (unlike player-controls.ts's Space/arrow
    // keys, which DO collide with a focused range input's native behavior):
    // N/P/Escape have no native meaning on #cVolume, and the focus trap
    // below must run regardless of what's focused or Tab escapes the
    // modal the instant the volume slider has focus — found by code review.
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'n' || e.key === 'N') render(current + 1);
    if (e.key === 'p' || e.key === 'P') render(current - 1);
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
