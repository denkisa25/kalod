/** CR-002 §0.2 — one AudioContext, ever.
 *
 *  Ghost contexts produce doubled playback that presents as a phantom sync
 *  bug and wastes hours. Browsers also cap the number of contexts per page,
 *  and each one holds an open output device.
 *
 *  Before this module the site could construct two: sound-control.ts for the
 *  UI blips, and opener/audio-engine.ts for the opener cue. The opener is a
 *  deliberate exception and is documented below; everything else routes here.
 *
 *  Not a class and not lazy-per-caller: the instance lives on `window` so it
 *  survives module duplication (two bundles importing this file would
 *  otherwise each get their own module-scope singleton, which is exactly the
 *  failure mode this exists to prevent).
 */

type Ctor = typeof AudioContext;

/* `Window` alone does not carry AudioContext — it lives on
 * `Window & typeof globalThis`, which is what the `window` binding is. */
type CtxWindow = Window & typeof globalThis & {
  __kdAudioCtx?: AudioContext | null;
  webkitAudioContext?: Ctor;
};

function ctor(): Ctor | null {
  const w = window as CtxWindow;
  return w.AudioContext || w.webkitAudioContext || null;
}

/** True when the browser can give us Web Audio at all. Callers that have a
 *  silent fallback (CR-002 §3.3) should branch on this rather than catching. */
export function isAudioSupported(): boolean {
  return ctor() !== null;
}

/** The one context. Returns null when Web Audio is unavailable — callers must
 *  handle that rather than assuming a context exists. Created suspended by
 *  autoplay policy; call resumeAudio() from a user gesture. */
export function getAudioContext(): AudioContext | null {
  const w = window as CtxWindow;
  if (w.__kdAudioCtx !== undefined) return w.__kdAudioCtx ?? null;
  const C = ctor();
  if (!C) {
    w.__kdAudioCtx = null;
    return null;
  }
  try {
    w.__kdAudioCtx = new C();
  } catch {
    w.__kdAudioCtx = null;
  }
  return w.__kdAudioCtx ?? null;
}

/** Resume from a user gesture. Safe to call repeatedly — the stem player and
 *  the sound toggle both call it and must not fight over the context. */
export async function resumeAudio(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* gesture requirement not met yet — caller retries on the next one */
    }
  }
  return ctx;
}

/** CR-002 §3.2 — without this, every hot reload leaves a live context playing
 *  underneath the new one. */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    (window as CtxWindow).__kdAudioCtx?.suspend();
  });
}
