import { T, env } from './timeline';
import { cssVar, hexToRgb } from './colors';
import { OpenerCanvasEngine } from './canvas-engine';
import {
  buildCue,
  decodeCueFile,
  playDecodedCue,
  deriveEnvelope,
  sampleEnvelope,
  type CueAudioHandle,
  type DerivedEnvelope,
} from './audio-engine';

const SESSION_KEY = 'kd-opener-seen';
const CUE_FILE_URL = '/audio/opener-cue.mp3';
// uppercase — logo-specific exception to the site's lowercase body-copy
// rule (v3 rebrand, docs/design/README.md), matches the header wordmark
const WORDMARK = 'KALOYAN DIMITROV';

// 'starting' covers the async gap in start() between the click and t0/
// cueAudio actually being ready (see start() below) — loop() treats it
// like 'idle' (keep drawing the idle waveform, don't evaluate t0) so a
// slow decodeCueFile() can never make it compute t = now - 0 and finish()
// the opener before it's begun.
type State = 'idle' | 'starting' | 'playing' | 'done';

export function initOpener(): void {
  const opener = document.getElementById('opener');
  const choice = document.getElementById('choice');
  const skipnote = document.getElementById('skipnote');
  const canvas = document.getElementById('fx') as HTMLCanvasElement | null;
  const withSoundBtn = document.getElementById('withSound');
  const withoutSoundBtn = document.getElementById('withoutSound');
  const replayBtn = document.getElementById('replayOpener');
  if (!opener || !choice || !skipnote || !canvas || !withSoundBtn || !withoutSoundBtn) return;

  // reduced-motion: skip the opener entirely, straight to content (spec
  // §6/§12 — CLAUDE.md marks this non-negotiable). The reference demo only
  // bypasses the *animation* once a choice button is clicked, but that
  // still shows the choice screen first; this ports the stricter behavior
  // the production spec actually requires.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    opener.remove();
    document.body.classList.add('ready');
    return;
  }

  // plays once per browser session, and never again on internal
  // navigation back to "/" within that session (spec §6). The reference
  // file doesn't gate this at all — it's a review tool, not production —
  // so this is new, not ported. Note this only skips the *automatic*
  // showing — the state machine and replay listener still need to be set
  // up below so "replay opener" in the footer keeps working afterward.
  const alreadySeen = sessionStorage.getItem(SESSION_KEY) !== null;

  const engine = new OpenerCanvasEngine({
    canvas,
    bg: cssVar('--color-bg'),
    accentRgb: hexToRgb(cssVar('--color-accent')),
    inkRgb: hexToRgb(cssVar('--color-ink')),
    headingRgb: hexToRgb(cssVar('--color-heading')),
    wordmarkText: WORDMARK,
  });

  let state: State = alreadySeen ? 'done' : 'idle';
  let t0 = 0;
  let raf: number | null = null;
  let last = 0;
  let cueAudio: CueAudioHandle | null = null;
  let envAt: (t: number) => number = (t) => env(t);

  // kicked off immediately so the file is (usually) ready by the time the
  // human finishes reading the choice screen and clicks
  let fileBuffer: AudioBuffer | null = null;
  const fileReady = decodeCueFile(CUE_FILE_URL).then((buf) => {
    fileBuffer = buf;
  });

  function resize() {
    engine.resize();
  }
  addEventListener('resize', resize);
  resize();
  if (document.fonts?.ready) document.fonts.ready.then(() => engine.sampleWordmark());

  function onOutroStart() {
    document.body.classList.add('ready');
    opener!.classList.add('outro');
  }

  function loop(now: number) {
    if (!last) last = now;
    const dt = now - last;
    last = now;
    if (state === 'idle' || state === 'starting') {
      engine.drawIdle(dt);
    } else if (state === 'playing') {
      const t = now - t0;
      engine.drawPlay(t, T, envAt, cueAudio?.analyser ?? null, cueAudio?.tdata ?? null, onOutroStart);
      if (t >= T.end) {
        finish();
        return;
      }
    }
    raf = requestAnimationFrame(loop);
  }

  async function start(withSound: boolean): Promise<void> {
    if (state !== 'idle') return;
    // visual feedback is immediate (choice hides, skip note shows) but the
    // state machine stays in 'starting' — not 'playing' — until t0 and
    // cueAudio are both actually ready a few lines down. Flipping straight
    // to 'playing' here raced loop(): if fileReady hadn't resolved yet, the
    // very next animation frame would compute t = now - t0 against the
    // still-zero t0, read as far past T.end, and call finish() instantly —
    // and once fileReady *did* resolve, this function's own tail would
    // still build a live cueAudio for an opener that had already "finished",
    // playing audio nothing on screen accounted for and nothing ever closed.
    state = 'starting';
    choice!.classList.add('gone');
    skipnote!.classList.add('show');
    engine.reset();

    await fileReady;
    cueAudio = null;

    if (fileBuffer) {
      if (withSound) {
        // client's real cue: play it through the same AnalyserNode shape
        // buildCue() uses, live FFT drives the waveform. Guarded the same
        // way as the buildCue() fallback below — AudioContext construction
        // can throw outside the click-gesture stack (we're past an await),
        // and without this the opener would get stuck mid-sequence with a
        // stale t0 instead of degrading to a silent-but-visible run.
        try {
          cueAudio = playDecodedCue(fileBuffer);
        } catch {
          cueAudio = null;
        }
        envAt = (t) => env(t);
      } else {
        // quiet mode never plays audio — derive the amplitude envelope
        // from the decoded buffer offline instead of the synthetic formula
        const derived: DerivedEnvelope = deriveEnvelope(fileBuffer);
        envAt = (t) => sampleEnvelope(derived, t);
      }
    } else {
      // no real cue yet — fall back to the synthesized placeholder
      envAt = (t) => env(t);
      if (withSound) {
        try {
          cueAudio = buildCue(T);
        } catch {
          cueAudio = null;
        }
      }
    }
    // atomic with the state flip — loop() must never see 'playing' with a
    // stale t0. Nothing else can have changed `state` while we were
    // awaiting fileReady: the skip handlers below only act on 'playing',
    // which we haven't been until this exact line.
    t0 = performance.now();
    state = 'playing';
  }

  function finish(): void {
    state = 'done';
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    last = 0;
    if (cueAudio) {
      cueAudio.ctx.close().catch(() => {});
      cueAudio = null;
    }
    skipnote!.classList.remove('show');
    document.body.classList.add('ready');
    opener!.classList.add('gone');
    sessionStorage.setItem(SESSION_KEY, '1');
  }

  function replay(): void {
    scrollTo({ top: 0, behavior: 'auto' });
    opener!.style.transition = '';
    opener!.classList.remove('gone', 'outro');
    choice!.classList.remove('gone');
    document.body.classList.remove('ready');
    state = 'idle';
    last = 0;
    engine.reset();
    raf = requestAnimationFrame(loop);
  }

  withSoundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void start(true);
  });
  withoutSoundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void start(false);
  });
  replayBtn?.addEventListener('click', replay);
  opener.addEventListener('pointerdown', () => {
    if (state === 'playing') finish();
  });
  addEventListener('keydown', (e) => {
    if (state === 'playing' && e.key !== 'Tab') finish();
  });

  if (alreadySeen) {
    // instant, no transition — this is a fresh page load, not a finish()
    opener.style.transition = 'none';
    opener.classList.add('gone');
    document.body.classList.add('ready');
  } else {
    raf = requestAnimationFrame(loop);
  }
}
