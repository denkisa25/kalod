import type { YTPlayer } from '../lib/youtube-api';

const IDLE_MS = 2500;
const YT_PLAYING = 1;

function formatTime(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export interface PlayerControls {
  /** called whenever video-layer.ts swaps in a new cue's player (or null,
   *  when the cue has no video / hasn't finished loading yet) */
  bindPlayer(player: YTPlayer | null): void;
}

/** CR-8 — the custom transport: play/pause, ±10s, volume+mute, a scrub bar
 *  driven by polling getCurrentTime()/getDuration() (the IFrame API has no
 *  timeupdate event), prev/next (wired by video-layer.ts, N/P not ←/→ — see
 *  that file), a keyboard-shortcut hint, and an idle-driven auto-hide
 *  shared by the whole chrome (top bar + controls + metadata). */
export function initPlayerControls(): PlayerControls {
  const detail = document.getElementById('detail');
  const chrome = detail?.querySelector<HTMLElement>('.chrome') ?? null;
  const playBtn = document.getElementById('cPlay');
  const clickzone = document.getElementById('playerClickzone');
  const backBtn = document.getElementById('cBack');
  const fwdBtn = document.getElementById('cFwd');
  const muteBtn = document.getElementById('cMute');
  const volumeInput = document.getElementById('cVolume') as HTMLInputElement | null;
  const scrub = document.getElementById('scrub');
  const scrubFill = document.getElementById('scrubFill');
  const elapsedEl = document.getElementById('cElapsed');
  const totalEl = document.getElementById('cTotal');
  const hintBtn = document.getElementById('cHint');
  const tapFeedback = document.getElementById('tapFeedback');
  const hint = document.getElementById('shortcutHint');
  const scrubBuffer = document.getElementById('scrubBuffer');
  const buffering = document.getElementById('playerBuffering');
  const rateBtn = document.getElementById('cRate');
  const pipBtn = document.getElementById('cPiP');
  const fullBtn = document.getElementById('cFull');

  let player: YTPlayer | null = null;
  let scrubbing = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** unsubscribes the CURRENT player's media listeners — called before every
   *  rebind so a previous cue's <video> cannot keep driving this UI */
  let unsubscribeMedia: (() => void) | null = null;
  let rafId: number | null = null;

  const RATES = [1, 1.25, 1.5, 2, 0.5] as const;

  function updatePlayIcon(): void {
    if (!playBtn) return;
    // no player bound (cue transition in flight) — reset to the default
    // rather than leaving the previous cue's label showing (found by
    // code review: this used to bail out entirely on a null player)
    const playing = player ? player.getPlayerState() === YT_PLAYING : false;
    playBtn.textContent = playing ? 'pause' : 'play';
    playBtn.setAttribute('aria-label', playing ? 'pause' : 'play');
  }

  function updateMuteIcon(): void {
    if (!muteBtn) return;
    const muted = player ? player.isMuted() : false;
    muteBtn.textContent = muted ? 'muted' : 'vol';
    muteBtn.setAttribute('aria-label', muted ? 'unmute' : 'mute');
  }

  /** One render of the transport, whatever drove it. */
  function render(): void {
    if (!player || scrubbing) return;
    const dur = player.getDuration();
    const cur = player.getCurrentTime();
    if (elapsedEl) elapsedEl.textContent = formatTime(cur);
    if (totalEl) totalEl.textContent = formatTime(dur);
    const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
    if (scrubFill) scrubFill.style.width = `${pct}%`;
    scrub?.setAttribute('aria-valuenow', String(Math.round(pct)));
    // Only a real media element can report this; stays 0 for iframes.
    if (scrubBuffer) scrubBuffer.style.width = `${(player.native?.bufferedRatio() ?? 0) * 100}%`;
    updatePlayIcon();
  }

  /** CR-003 — YouTube's IFrame API has no timeupdate event, so the only way
   *  to drive this UI was a rAF loop that ran for the entire life of the page
   *  whether or not anything was playing. A native <video> emits real events,
   *  so polling is now the FALLBACK rather than the default, and it stops when
   *  no iframe player is bound. The scrub fill carries a CSS transition so
   *  timeupdate's ~4Hz cadence still reads as smooth motion. */
  function startPolling(): void {
    if (rafId !== null) return;
    const loop = () => {
      render();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  function stopPolling(): void {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function setBuffering(on: boolean): void {
    if (buffering) buffering.hidden = !on;
  }

  function updateRateLabel(): void {
    if (!rateBtn || !player?.native) return;
    const r = player.native.getRate();
    rateBtn.textContent = `${r}\u00d7`;
    rateBtn.setAttribute('aria-label', `playback speed ${r}x`);
  }

  function seekToRatio(ratio: number): void {
    if (!player) return;
    const dur = player.getDuration();
    if (dur > 0) player.seekTo(dur * Math.max(0, Math.min(1, ratio)), true);
  }

  function ratioFromClientX(clientX: number): number {
    const rect = scrub!.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  }

  scrub?.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    // kills the smoothing transition so the fill tracks the pointer exactly
    scrub.classList.add('scrubbing');
    seekToRatio(ratioFromClientX(e.clientX));
    const move = (ev: PointerEvent) => seekToRatio(ratioFromClientX(ev.clientX));
    const up = () => {
      scrubbing = false;
      scrub.classList.remove('scrubbing');
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  /** CR-003 — flash the state the tap PRODUCED, not the one it interrupted:
   *  tapping a playing video shows the pause glyph. Restarting the animation
   *  needs the class removed and the frame forced, otherwise a second tap
   *  inside the animation's duration does nothing visible. */
  function flashTapFeedback(nowPlaying: boolean): void {
    if (!tapFeedback) return;
    tapFeedback.dataset.state = nowPlaying ? 'play' : 'pause';
    tapFeedback.classList.remove('show');
    void tapFeedback.offsetWidth;
    tapFeedback.classList.add('show');
  }

  function togglePlay(): void {
    if (!player) return;
    const wasPlaying = player.getPlayerState() === YT_PLAYING;
    if (wasPlaying) player.pauseVideo();
    else player.playVideo();
    flashTapFeedback(!wasPlaying);
  }
  playBtn?.addEventListener('click', togglePlay);
  // click/tap anywhere on the video toggles play/pause, same as #cPlay —
  // showChrome() still fires from this element's pointerdown bubbling up
  // to #detail's own listener, so tapping the video also briefly reveals
  // the (otherwise auto-hidden) control bar rather than only toggling
  // playback silently underneath it.
  //
  // 'click' alone here was reported not to respond on mobile Safari — using
  // pointerup instead (fires on both touch and mouse) plus suppressing the
  // click that follows it (some WebKit versions are unreliable synthesizing
  // 'click' for a plain div overlaying a cross-origin iframe; pointerup is
  // not).
  clickzone?.addEventListener('pointerup', (e) => {
    e.preventDefault();
    togglePlay();
  });
  clickzone?.addEventListener('click', (e) => e.preventDefault());
  backBtn?.addEventListener('click', () => {
    if (player) player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
  });
  fwdBtn?.addEventListener('click', () => {
    if (player) player.seekTo(player.getCurrentTime() + 10, true);
  });
  muteBtn?.addEventListener('click', () => {
    if (!player) return;
    if (player.isMuted()) player.unMute();
    else player.mute();
    updateMuteIcon();
  });
  volumeInput?.addEventListener('input', () => {
    if (!player || !volumeInput) return;
    const v = Number(volumeInput.value);
    player.setVolume(v);
    if (v > 0 && player.isMuted()) player.unMute();
    updateMuteIcon();
  });
  hintBtn?.addEventListener('click', () => {
    const willShow = hint?.hidden !== false;
    if (hint) hint.hidden = !willShow;
    hintBtn.setAttribute('aria-expanded', String(willShow));
  });

  rateBtn?.addEventListener('click', () => {
    if (!player?.native) return;
    const i = RATES.indexOf(player.native.getRate() as (typeof RATES)[number]);
    const next = RATES[(i + 1) % RATES.length];
    player.native.setRate(next);
    // CR-9's ambient surround is a second <video> playing the same source,
    // and it is not driven by the player adapter. Leaving it at 1x while the
    // frame runs at 2x makes the blurred spill visibly disagree with the
    // picture it is supposed to be bleeding from, so it follows the rate too.
    // (They were never frame-synced — two independent elements — but matching
    // rates at least keeps them drifting together rather than apart.)
    const ambientVideo = detail?.querySelector<HTMLVideoElement>('.stage-ambient video');
    if (ambientVideo) ambientVideo.playbackRate = next;
    updateRateLabel();
  });

  pipBtn?.addEventListener('click', () => {
    void player?.native?.togglePiP();
  });

  // Fullscreens #detail, NOT the <video>. Fullscreening the media element
  // hands over to the browser's own control chrome, which is exactly the
  // YouTube-looking thing CR-8 exists to avoid; fullscreening our container
  // keeps the custom transport, the letterbox and the ambient blur. Works for
  // iframe-backed cues too, which is why this button is never hidden.
  fullBtn?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void detail?.requestFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === detail;
    fullBtn?.setAttribute('aria-label', on ? 'exit fullscreen' : 'fullscreen');
    if (fullBtn) fullBtn.textContent = on ? 'exit' : 'full';
  });

  function showChrome(): void {
    chrome?.classList.remove('idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (player?.getPlayerState() === YT_PLAYING) chrome?.classList.add('idle');
    }, IDLE_MS);
  }
  detail?.addEventListener('pointermove', showChrome);
  detail?.addEventListener('pointerdown', showChrome);
  detail?.addEventListener('keydown', showChrome);

  // Space/←→/↑↓/M/? — N/P (next/prev cue) and Escape (close) are handled by
  // video-layer.ts's own keydown listener, which also owns the focus trap.
  addEventListener('keydown', (e) => {
    if (!detail?.classList.contains('open')) return;
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (player) {
          if (player.getPlayerState() === YT_PLAYING) player.pauseVideo();
          else player.playVideo();
        }
        break;
      case 'ArrowRight':
        if (player) player.seekTo(player.getCurrentTime() + 10, true);
        break;
      case 'ArrowLeft':
        if (player) player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (player && volumeInput) {
          volumeInput.value = String(Math.min(100, player.getVolume() + 10));
          player.setVolume(Number(volumeInput.value));
          updateMuteIcon();
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (player && volumeInput) {
          volumeInput.value = String(Math.max(0, player.getVolume() - 10));
          player.setVolume(Number(volumeInput.value));
          updateMuteIcon();
        }
        break;
      case 'm':
      case 'M':
        muteBtn?.click();
        break;
      case '?':
        hintBtn?.click();
        break;
    }
  });

  return {
    bindPlayer(p) {
      // Always detach the previous cue's listeners first — without this a
      // rebind leaves the old <video> still driving this UI, and the two
      // fight over the scrub bar.
      unsubscribeMedia?.();
      unsubscribeMedia = null;
      stopPolling();
      setBuffering(false);

      player = p;
      chrome?.classList.remove('idle');
      if (p && volumeInput) volumeInput.value = String(p.getVolume());

      const native = p?.native;
      // Controls that cannot work over a cross-origin iframe are hidden
      // rather than shown inert — CR-001's review caught exactly this with
      // the Vimeo control bar, and a dead button is worse than no button.
      if (rateBtn) rateBtn.hidden = !native;
      if (pipBtn) pipBtn.hidden = !native?.supportsPiP();

      if (native) {
        unsubscribeMedia = native.on(
          ['timeupdate', 'progress', 'play', 'pause', 'seeked', 'durationchange', 'ratechange'],
          render,
        );
        const stall = native.on(['waiting'], () => setBuffering(true));
        const resume = native.on(['playing', 'canplay', 'pause'], () => setBuffering(false));
        const prevUnsub = unsubscribeMedia;
        unsubscribeMedia = () => {
          prevUnsub();
          stall();
          resume();
        };
        updateRateLabel();
      } else if (p) {
        // iframe-backed cue: no media events exist, so fall back to polling.
        startPolling();
      }

      updateMuteIcon();
      updatePlayIcon();
      render();
      showChrome();
    },
  };
}
