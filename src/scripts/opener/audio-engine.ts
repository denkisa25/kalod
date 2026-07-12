import type { Timeline } from './timeline';

type AudioContextCtor = typeof AudioContext;
function getAudioContextCtor(): AudioContextCtor {
  return window.AudioContext || (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
}

export interface CueAudioHandle {
  ctx: AudioContext;
  analyser: AnalyserNode;
  tdata: Uint8Array<ArrayBuffer>;
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Placeholder signature cue — synthesized thumps/riser/hits/drop/pad
 *  matching the T timeline exactly. Superseded by loadCueFromFile() once
 *  the client supplies public/audio/opener-cue.mp3; kept as the fallback
 *  so the opener always has something to play. */
export function buildCue(T: Timeline): CueAudioHandle {
  const ctx = new (getAudioContextCtor())();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const tdata = new Uint8Array(analyser.fftSize);
  master.connect(analyser);
  analyser.connect(ctx.destination);

  const now = ctx.currentTime + 0.06;
  const at = (ms: number) => now + ms / 1000;
  const nb = noiseBuffer(ctx);

  // sub rumble bed
  {
    const s = ctx.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.03, at(400));
    g.gain.linearRampToValueAtTime(0, at(T.end));
    s.connect(f).connect(g).connect(master);
    s.start(now);
    s.stop(at(T.end));
  }

  const thump = (ms: number, gn = 0.9, f0 = 130, f1 = 42) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, at(ms));
    o.frequency.exponentialRampToValueAtTime(f1, at(ms + 140));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at(ms));
    g.gain.linearRampToValueAtTime(gn, at(ms + 12));
    g.gain.exponentialRampToValueAtTime(0.001, at(ms + 420));
    o.connect(g).connect(master);
    o.start(at(ms));
    o.stop(at(ms + 500));

    const s = ctx.createBufferSource();
    s.buffer = nb;
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18, at(ms));
    ng.gain.exponentialRampToValueAtTime(0.001, at(ms + 60));
    s.connect(hf).connect(ng).connect(master);
    s.start(at(ms));
    s.stop(at(ms + 80));
  };
  T.thumps.forEach((ms) => thump(ms, 0.8));
  T.hits.forEach((ms, i) => thump(ms, 0.55 + i * 0.12, 180, 60));

  // riser
  {
    const s = ctx.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(220, at(T.riser[0]));
    bp.frequency.exponentialRampToValueAtTime(3600, at(T.riser[1]));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at(T.riser[0]));
    g.gain.linearRampToValueAtTime(0.22, at(T.riser[1] - 120));
    g.gain.setValueAtTime(0, at(T.riser[1]));
    s.connect(bp).connect(g).connect(master);
    s.start(at(T.riser[0]));
    s.stop(at(T.riser[1]));

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, at(T.riser[0]));
    o.frequency.exponentialRampToValueAtTime(620, at(T.riser[1]));
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, at(T.riser[0]));
    og.gain.linearRampToValueAtTime(0.05, at(T.riser[1] - 150));
    og.gain.setValueAtTime(0, at(T.riser[1]));
    o.connect(og).connect(master);
    o.start(at(T.riser[0]));
    o.stop(at(T.riser[1]));
  }

  thump(T.drop, 1, 150, 34);

  // drop noise sweep
  {
    const s = ctx.createBufferSource();
    s.buffer = nb;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, at(T.drop));
    lp.frequency.exponentialRampToValueAtTime(400, at(T.drop + 1100));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, at(T.drop));
    g.gain.exponentialRampToValueAtTime(0.001, at(T.drop + 1200));
    s.connect(lp).connect(g).connect(master);
    s.start(at(T.drop));
    s.stop(at(T.drop + 1300));
  }

  // hold pad
  {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 780;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0, at(T.drop + 40));
    pg.gain.linearRampToValueAtTime(0.16, at(T.drop + 420));
    pg.gain.setValueAtTime(0.16, at(T.outro));
    pg.gain.linearRampToValueAtTime(0, at(T.end - 100));
    lp.connect(pg).connect(master);
    const voices: Array<[number, number]> = [
      [110, 0],
      [110, 7],
      [164.81, -5],
      [246.94, 4],
      [261.63, 0],
    ];
    for (const [f, dt] of voices) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = dt;
      const og = ctx.createGain();
      og.gain.value = 0.22;
      o.connect(og).connect(lp);
      o.start(at(T.drop + 40));
      o.stop(at(T.end));
    }
  }

  return { ctx, analyser, tdata };
}

/** Fetches + decodes the client's real cue if it exists. Returns null on
 *  any failure (404 in dev, decode error, etc.) so the caller falls back
 *  to buildCue() without special-casing the missing-file case. */
export async function decodeCueFile(url: string): Promise<AudioBuffer | null> {
  let decodeCtx: AudioContext | null = null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    decodeCtx = new (getAudioContextCtor())();
    return await decodeCtx.decodeAudioData(arrayBuffer);
  } catch {
    // corrupt/truncated/unsupported-codec file — fall back to buildCue()
    return null;
  } finally {
    // always released, including when decodeAudioData rejects — otherwise
    // a bad file leaks one AudioContext per page load toward the browser's
    // concurrent-context cap
    await decodeCtx?.close().catch(() => {});
  }
}

/** Plays a decoded buffer through a fresh AnalyserNode — same graph shape
 *  buildCue() uses, so drawPlay() doesn't need to know which source it's
 *  reading from. */
export function playDecodedCue(buffer: AudioBuffer): CueAudioHandle {
  const ctx = new (getAudioContextCtor())();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const tdata = new Uint8Array(analyser.fftSize);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  source.start(ctx.currentTime + 0.06);
  return { ctx, analyser, tdata };
}

export interface DerivedEnvelope {
  samples: Float32Array;
  windowMs: number;
}

/** Offline amplitude envelope (RMS per fixed-size window), normalized to
 *  the same ~0–1.6 ceiling the synthetic env(t) formula uses so drawPlay()
 *  can treat either source identically. This is the "precomputed amplitude"
 *  quiet mode needs (spec §6) — derived from the real cue instead of a
 *  hand-authored approximation. */
export function deriveEnvelope(buffer: AudioBuffer, windowMs = 20): DerivedEnvelope {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * sr));
  const windows = Math.ceil(data.length / windowSize);
  const samples = new Float32Array(windows);
  for (let w = 0; w < windows; w++) {
    const start = w * windowSize;
    const end = Math.min(start + windowSize, data.length);
    let sumSq = 0;
    for (let i = start; i < end; i++) sumSq += data[i] * data[i];
    samples[w] = Math.sqrt(sumSq / (end - start));
  }
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, v);
  const scale = peak > 0 ? 1.6 / peak : 1;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return { samples, windowMs };
}

export function sampleEnvelope(env: DerivedEnvelope, t: number): number {
  const idx = Math.min(env.samples.length - 1, Math.max(0, Math.floor(t / env.windowMs)));
  return env.samples[idx] ?? 0;
}
