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
  // always persisted, even when it matches the current value — records
  // that an explicit choice was made this session (see initAutoArmSound,
  // which must not override "enter quietly" just because that choice
  // happened to match the already-off default and hit this early return
  // in the past, before the write moved above it).
  sessionStorage.setItem(SESSION_KEY, enabled ? '1' : '0');
  if (enabled === soundEnabled) return;
  soundEnabled = enabled;
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

/** Real autoplay-with-sound is blocked by every browser without a user
 *  gesture — there's no way around that. This is the closest equivalent:
 *  the first interaction anywhere on the home page (scroll, click, key)
 *  arms feed sound automatically, instead of requiring the visitor to
 *  specifically find and click the small header icon. Only when no
 *  explicit choice exists yet this session — a returning visitor who
 *  already muted, or who chose "enter quietly" on the opener, is left
 *  alone; excludes gestures inside the sound toggle buttons themselves
 *  (already have their own click handler — both firing on the same click
 *  would toggle twice and land on the opposite state) and inside #opener
 *  (its own "enter with sound"/"enter quietly" buttons are the explicit
 *  choice for that gesture, not a generic arm-and-forget). */
export function initAutoArmSound(): void {
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  function cleanup(): void {
    events.forEach((ev) => document.removeEventListener(ev, arm, true));
  }
  function arm(e: Event): void {
    // re-checked on every gesture, not just once at attach time — the
    // opener's "enter with sound"/"enter quietly" buttons can set an
    // explicit choice well after this listener first attached (a scroll
    // right after clicking "enter quietly" was silently re-enabling sound,
    // because this check used to run only once, before the opener choice
    // existed — found via testing the "enter quietly" path).
    if (sessionStorage.getItem(SESSION_KEY) !== null) {
      cleanup();
      return;
    }
    if ((e.target as HTMLElement)?.closest?.('#soundToggle, #soundToggleMobile, #opener')) return;
    setSoundEnabled(true);
    cleanup();
  }
  events.forEach((ev) => document.addEventListener(ev, arm, { capture: true, passive: true }));
}
