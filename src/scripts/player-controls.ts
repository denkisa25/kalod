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
  const backBtn = document.getElementById('cBack');
  const fwdBtn = document.getElementById('cFwd');
  const muteBtn = document.getElementById('cMute');
  const volumeInput = document.getElementById('cVolume') as HTMLInputElement | null;
  const scrub = document.getElementById('scrub');
  const scrubFill = document.getElementById('scrubFill');
  const elapsedEl = document.getElementById('cElapsed');
  const totalEl = document.getElementById('cTotal');
  const hintBtn = document.getElementById('cHint');
  const hint = document.getElementById('shortcutHint');

  let player: YTPlayer | null = null;
  let scrubbing = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function updatePlayIcon(): void {
    if (!playBtn || !player) return;
    const playing = player.getPlayerState() === YT_PLAYING;
    playBtn.textContent = playing ? 'pause' : 'play';
    playBtn.setAttribute('aria-label', playing ? 'pause' : 'play');
  }

  function updateMuteIcon(): void {
    if (!muteBtn || !player) return;
    const muted = player.isMuted();
    muteBtn.textContent = muted ? 'muted' : 'vol';
    muteBtn.setAttribute('aria-label', muted ? 'unmute' : 'mute');
  }

  function tick(): void {
    if (player && !scrubbing) {
      const dur = player.getDuration();
      const cur = player.getCurrentTime();
      if (elapsedEl) elapsedEl.textContent = formatTime(cur);
      if (totalEl) totalEl.textContent = formatTime(dur);
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      if (scrubFill) scrubFill.style.width = `${pct}%`;
      scrub?.setAttribute('aria-valuenow', String(Math.round(pct)));
      updatePlayIcon();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

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
    seekToRatio(ratioFromClientX(e.clientX));
    const move = (ev: PointerEvent) => seekToRatio(ratioFromClientX(ev.clientX));
    const up = () => {
      scrubbing = false;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  playBtn?.addEventListener('click', () => {
    if (!player) return;
    if (player.getPlayerState() === YT_PLAYING) player.pauseVideo();
    else player.playVideo();
  });
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
      player = p;
      chrome?.classList.remove('idle');
      if (p && volumeInput) volumeInput.value = String(p.getVolume());
      updateMuteIcon();
      updatePlayIcon();
      showChrome();
    },
  };
}
