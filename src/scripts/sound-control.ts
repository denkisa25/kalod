/** CR-4/D2 — a single sound control for the whole site: it drives the feed's
 *  background-video audio (video-layer.ts subscribes via onSoundChange) AND
 *  the UI hover/click blips (ported from docs/reference/site-concept-v3.html's
 *  blip() synth). One button, one mental model — this REPLACES the old
 *  disabled EQ-bars "coming soon" toggle, it isn't a second control beside it. */

const SESSION_KEY = 'kd-feed-sound';

let soundEnabled = sessionStorage.getItem(SESSION_KEY) === '1';
let uiCtx: AudioContext | null = null;
let lastBlip = 0;
const listeners = new Set<(enabled: boolean) => void>();

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function onSoundChange(cb: (enabled: boolean) => void): void {
  listeners.add(cb);
}

export function setSoundEnabled(enabled: boolean): void {
  if (enabled === soundEnabled) return;
  soundEnabled = enabled;
  sessionStorage.setItem(SESSION_KEY, enabled ? '1' : '0');
  document.body.classList.toggle('sound-on', enabled);
  document.querySelectorAll<HTMLButtonElement>('#soundToggle, #soundToggleMobile').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(enabled));
    btn.setAttribute('aria-label', enabled ? 'sound on — mute' : 'sound off — unmute');
    btn.title = btn.getAttribute('aria-label')!;
  });
  if (enabled && !uiCtx) {
    try {
      uiCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      uiCtx = null;
    }
  }
  listeners.forEach((cb) => cb(enabled));
}

/** Short synthesized tone for [data-blip] elements — a click/hover
 *  micro-feedback sound, gated by the same toggle as the feed's audio. */
function blip(freq = 1500, dur = 0.045, gain = 0.05): void {
  if (!soundEnabled || !uiCtx) return;
  const t = uiCtx.currentTime;
  if (t - lastBlip < 0.06) return; // debounce — rapid hovers shouldn't stack tones
  lastBlip = t;
  const osc = uiCtx.createOscillator();
  const g = uiCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(uiCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function initSoundControl(): void {
  document.body.classList.toggle('sound-on', soundEnabled);
  document.querySelectorAll<HTMLButtonElement>('#soundToggle, #soundToggleMobile').forEach((btn) => {
    btn.disabled = false;
    btn.setAttribute('aria-pressed', String(soundEnabled));
    btn.setAttribute('aria-label', soundEnabled ? 'sound on — mute' : 'sound off — unmute');
    btn.title = btn.getAttribute('aria-label')!;
    btn.addEventListener('click', () => setSoundEnabled(!soundEnabled));
  });

  if (soundEnabled) {
    try {
      uiCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      uiCtx = null;
    }
  }

  document.querySelectorAll<HTMLElement>('[data-blip]').forEach((el) => {
    el.addEventListener('mouseenter', () => blip(1500));
    el.addEventListener('click', () => blip(900, 0.07, 0.06));
  });
}
