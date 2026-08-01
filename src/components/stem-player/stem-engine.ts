/** CR-002 §2.4 — the stem transport, ported from lab/stem-lab.html.
 *
 *  Nothing in this file knows what the picture is. It talks to PictureSource
 *  only, so the Cloudflare Stream / hls.js swap (§5) touches a factory call
 *  and not the engine.
 */
import type { PictureSource } from './picture-source';

export interface StemDef {
  id: string;
  label: string;
  src: string;
}

export const MASTER_CEILING = 0.5; // §0.1 — hard ceiling, never exceeded
const LEAD = 0.15; // §2.4 — shared scheduling lead
const RAMP = 0.05; // §2.4 — toggle ramp
export const DRIFT_INTERVAL_MS = 500;

/* Correction zones. The correction deadband and the acceptance budget are
   DIFFERENT numbers — see the §2.4/§2.4a amendment. The original spec used
   0.04 for both, which let the corrector stop the moment it entered the
   budget and park at its edge: a permanent 27 ms desync that still passed
   the §2.7 acceptance check. */
export const LOCK_S = 0.01; // < 10 ms  → locked, rate = 1
export const RESYNC_S = 0.4; // > 400 ms → not drift; log and hard-resync
const CORRECT_TAU = 1.0; // close the error over ~1 s (measured; see §2.4a)
const MAX_RATE_DEV = 0.05; // ±5% clamp on the proportional term
export const BUDGET_S = 0.04; // §2.7 acceptance budget — reporting only

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** source ×N → stemGain → master (≤0.5) → limiter → destination.
 *  Built once and never torn down. There is no code path from a source to
 *  ctx.destination (§0.1) — a mis-scaled buffer at full scale through studio
 *  monitors is the one accident that ends this project. */
export class StemGraph {
  readonly limiter: DynamicsCompressorNode;
  readonly master: GainNode;
  readonly stemGains = new Map<string, GainNode>();
  readonly analysers = new Map<string, AnalyserNode>();

  constructor(
    private ctx: AudioContext,
    stems: StemDef[],
  ) {
    // knee left at its default: the spec enumerates four parameters, and a
    // softer knee only ever limits earlier, i.e. in the safe direction.
    this.limiter = new DynamicsCompressorNode(ctx, {
      threshold: -6,
      ratio: 20,
      attack: 0.003,
      release: 0.1,
    });
    this.limiter.connect(ctx.destination);

    this.master = new GainNode(ctx, { gain: MASTER_CEILING });
    this.master.connect(this.limiter);

    for (const s of stems) {
      const g = new GainNode(ctx, { gain: 1 });
      g.connect(this.master);
      this.stemGains.set(s.id, g);

      // post-gain tap, so a muted stem reads zero and the meter confirms the
      // toggle actually landed. An analyser needs no output connection.
      const a = new AnalyserNode(ctx, { fftSize: 256, smoothingTimeConstant: 0.6 });
      g.connect(a);
      this.analysers.set(s.id, a);
    }
  }

  /** §2.4 — never assign .value. cancelScheduledValues + setValueAtTime
   *  anchors the ramp to *now* rather than to the last scheduled event;
   *  without the anchor, a second toggle inside 50 ms steps audibly instead
   *  of fading. Reading .value here is not an assignment. */
  ramp(param: AudioParam, target: number, dur = RAMP): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + dur);
  }

  setStem(id: string, on: boolean): void {
    const g = this.stemGains.get(id);
    if (g) this.ramp(g.gain, on ? 1 : 0);
  }

  setMaster(v: number): void {
    this.ramp(this.master.gain, clamp(v, 0, MASTER_CEILING));
  }

  /** Peak level 0..1 for the meter, sampled post-gain. The explicit
   *  ArrayBuffer type argument matters: getFloatTimeDomainData rejects a
   *  possibly-shared backing buffer. */
  level(id: string, buf: Float32Array<ArrayBuffer>): number {
    const a = this.analysers.get(id);
    if (!a) return 0;
    a.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }
}

export type Zone = 'lock' | 'correct' | 'resync';

/** §2.7 asks whether the rate settles or oscillates. Instrumented so the
 *  answer is measured rather than eyeballed. */
export class DriftStats {
  samples = 0;
  min = Infinity;
  max = -Infinity;
  absMax = 0;
  lockedS = 0;
  correctingS = 0;
  resyncs = 0;
  budgetBreaches = 0;
  rateMin = 1;
  rateMax = 1;
  trace: number[] = [];

  constructor(private traceSeconds = 60) {}

  reset(): void {
    this.samples = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this.absMax = 0;
    this.lockedS = 0;
    this.correctingS = 0;
    this.resyncs = 0;
    this.budgetBreaches = 0;
    this.rateMin = 1;
    this.rateMax = 1;
    this.trace = [];
  }

  record(drift: number, rate: number, zone: Zone): void {
    this.samples++;
    this.min = Math.min(this.min, drift);
    this.max = Math.max(this.max, drift);
    this.absMax = Math.max(this.absMax, Math.abs(drift));
    if (Math.abs(drift) > BUDGET_S) this.budgetBreaches++;
    if (zone === 'resync') this.resyncs++;
    else if (zone === 'lock') this.lockedS += DRIFT_INTERVAL_MS / 1000;
    else this.correctingS += DRIFT_INTERVAL_MS / 1000;
    this.rateMin = Math.min(this.rateMin, rate);
    this.rateMax = Math.max(this.rateMax, rate);
    this.trace.push(drift);
    const cap = (this.traceSeconds * 1000) / DRIFT_INTERVAL_MS;
    while (this.trace.length > cap) this.trace.shift();
  }
}

/** AudioBufferSourceNode is single-use, so NO state lives inside the sources.
 *  Everything derives from (t0, startOffset) against ctx.currentTime. */
export class Transport {
  sources: AudioBufferSourceNode[] = [];
  playing = false;
  t0 = 0;
  startOffset = 0;
  offsetMs = 0;
  drift = 0;
  rate = 1;
  zone: Zone = 'lock';
  readonly stats = new DriftStats();
  readonly duration: number;

  #gen = 0;
  #driftTimer = 0;
  #pictureStartTimer = 0;

  constructor(
    private ctx: AudioContext,
    private graph: StemGraph,
    private picture: PictureSource,
    private stems: StemDef[],
    private buffers: Map<string, AudioBuffer>,
    offsetMs = 0,
  ) {
    this.offsetMs = offsetMs;
    this.duration = buffers.get(stems[0].id)!.duration;
  }

  get position(): number {
    if (!this.playing) return this.startOffset;
    const elapsed = this.ctx.currentTime - this.t0; // negative during pre-roll
    return clamp(this.startOffset + Math.max(0, elapsed), 0, this.duration);
  }

  /** Device output latency, read live rather than baked: audio scheduled at
   *  ctx.currentTime is not AUDIBLE until baseLatency + outputLatency later,
   *  while the picture is presented immediately. Measured 45.33 ms on the
   *  development machine, matching the uncompensated opening drift to within
   *  a millisecond. Left in the loop it is a constant the corrector cannot
   *  remove, and with a 10 ms lock zone it would be fought forever. It also
   *  changes when the user switches output device, so it must not be baked.
   *
   *  Kept SEPARATE from offsetMs, the content-side AAC priming constant of
   *  §6: one is the device, one is the asset. */
  get latencyComp(): number {
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
  }

  /** §2.4's formula is the startOffset === 0, zero-latency case. */
  get expected(): number {
    return (
      this.ctx.currentTime - this.latencyComp - this.t0 + this.startOffset + this.offsetMs / 1000
    );
  }

  async play(atOffset: number = this.position): Promise<void> {
    const myGen = ++this.#gen;
    this.disposeSources();

    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.#gen !== myGen) return; // superseded while resuming

    let offset = clamp(atOffset, 0, this.duration);
    if (this.duration - offset < 0.05) offset = 0; // at the tail → from the top

    const t0 = this.ctx.currentTime + LEAD;
    for (const s of this.stems) {
      const src = new AudioBufferSourceNode(this.ctx, { buffer: this.buffers.get(s.id)! });
      src.connect(this.graph.stemGains.get(s.id)!);
      src.start(t0, offset); // one shared t0 → sample-locked by construction
      this.sources.push(src);
    }

    this.t0 = t0;
    this.startOffset = offset;
    this.playing = true;
    this.stats.reset();

    this.picture.seek(offset);
    this.picture.setRate(1);
    this.rate = 1;
    // The picture must not start before t0. The generation check stops a
    // pause issued inside the 150 ms lead from being undone by this timer.
    this.#pictureStartTimer = window.setTimeout(
      () => {
        if (this.#gen === myGen) void this.picture.play();
      },
      Math.max(0, (t0 - this.ctx.currentTime) * 1000),
    );

    this.#startDriftLoop();
  }

  pause(): void {
    if (!this.playing) return;
    const pos = this.position; // capture BEFORE teardown
    this.#gen++;
    this.disposeSources();
    this.#stopDriftLoop();
    this.picture.pause();
    this.picture.setRate(1);
    this.rate = 1;
    this.playing = false;
    this.startOffset = pos;
  }

  seek(t: number): void {
    const wasPlaying = this.playing;
    this.#gen++;
    this.disposeSources();
    this.#stopDriftLoop();
    this.playing = false;
    this.startOffset = clamp(t, 0, this.duration);
    this.picture.pause();
    this.picture.seek(this.startOffset);
    this.picture.setRate(1); // correction state is meaningless across a cut
    this.rate = 1;
    this.drift = 0;
    if (wasPlaying) void this.play(this.startOffset);
  }

  /** Teardown order matters. onended is nulled BEFORE stop() because stop()
   *  fires onended — a handler reading that as "the piece finished" resets
   *  the transport on every pause and seek, and it presents as a sync bug.
   *  For the same reason end-of-media is detected in the host's rAF tick.
   *
   *  src.buffer is deliberately not nulled: it cannot be reassigned once set,
   *  and disconnect plus dropping the reference is enough. The decoded
   *  AudioBuffers are held once, outside the sources, and reused on every
   *  rebuild — so a seek allocates a handful of small nodes, not 73 MB. */
  disposeSources(): void {
    clearTimeout(this.#pictureStartTimer);
    this.#pictureStartTimer = 0;
    for (const src of this.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped, or never started */
      }
      src.disconnect();
    }
    this.sources.length = 0;
  }

  dispose(): void {
    this.#gen++;
    this.disposeSources();
    this.#stopDriftLoop();
    this.playing = false;
  }

  #startDriftLoop(): void {
    this.#stopDriftLoop();
    this.#driftTimer = window.setInterval(() => this.correct(), DRIFT_INTERVAL_MS);
  }
  #stopDriftLoop(): void {
    clearInterval(this.#driftTimer);
    this.#driftTimer = 0;
  }

  /** Three-zone corrector.
   *    |drift| < 10 ms    → locked, rate = 1.
   *    10–400 ms          → proportional: close the error over ~CORRECT_TAU
   *                         seconds, clamped to ±5%.
   *    > 400 ms           → not drift. Log and hard-resync.
   *
   *  The first two zones correct by RATE only and never seek — that is what
   *  keeps working when VideoPicture/HLS arrives, where a seek costs a
   *  rebuffer. The third zone deliberately does seek: above 400 ms something
   *  discontinuous has happened (a stall, a device switch, a backgrounded
   *  tab) and a rebuffer is the cheaper of the two evils. Resyncs are counted
   *  so a player resyncing repeatedly is visible rather than silent. */
  correct(): void {
    if (!this.playing) return;
    if (this.ctx.currentTime < this.t0) return; // pre-roll
    if (this.position > this.duration - 0.5) return; // tail

    const drift = this.picture.currentTime - this.expected;
    const mag = Math.abs(drift);
    let rate = 1;
    let zone: Zone = 'lock';

    if (mag >= RESYNC_S) {
      zone = 'resync';
      const target = clamp(this.expected, 0, this.duration);
      console.warn(
        `[stem-player] hard resync: drift ${(drift * 1000).toFixed(0)} ms exceeds ` +
          `${RESYNC_S * 1000} ms — seeking picture to ${target.toFixed(3)}s`,
      );
      this.picture.seek(target);
      this.picture.setRate(1);
    } else if (mag >= LOCK_S) {
      zone = 'correct';
      rate = clamp(1 - drift / CORRECT_TAU, 1 - MAX_RATE_DEV, 1 + MAX_RATE_DEV);
      this.picture.setRate(rate);
    } else {
      this.picture.setRate(1);
    }

    this.drift = drift;
    this.rate = rate;
    this.zone = zone;
    this.stats.record(drift, rate, zone);
  }
}

/** §2.4 — real per-byte progress, not a spinner. */
export async function fetchWithProgress(
  url: string,
  onBytes: (received: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → http ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(received, total);
  }
  const out = new Uint8Array(received);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

/** Decode all stems and assert they are sample-locked. A silent length
 *  mismatch is what makes the §6 null test unfixable later. */
export async function decodeStems(
  ctx: AudioContext,
  stems: StemDef[],
  arrays: ArrayBuffer[],
): Promise<Map<string, AudioBuffer>> {
  const decoded = await Promise.all(arrays.map((a) => ctx.decodeAudioData(a)));
  const lengths = new Set(decoded.map((b) => b.length));
  const rates = new Set(decoded.map((b) => b.sampleRate));
  if (lengths.size !== 1 || rates.size !== 1) {
    throw new Error(
      'stems are not sample-locked:\n' +
        decoded
          .map(
            (b, i) =>
              `  ${stems[i].id}: ${b.length} samples @ ${b.sampleRate} hz (${b.duration.toFixed(6)}s)`,
          )
          .join('\n') +
        '\nregenerate with lab/make-stems.sh; do not proceed with unequal buffers.',
    );
  }
  return new Map(stems.map((s, i) => [s.id, decoded[i]]));
}
