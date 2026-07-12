import { pseudo, type Timeline } from './timeline';

interface Point {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  a: number;
  decay: number;
  target: Point | null;
  size: number;
}

interface Wave {
  r: number;
  a: number;
  slow?: boolean;
}

export interface CanvasEngineOptions {
  canvas: HTMLCanvasElement;
  bg: string;
  accentRgb: string;
  inkRgb: string;
  /** bright core color for the waveform highlight stroke and drop flash —
   *  resolved from --color-heading, not an invented literal (CLAUDE.md:
   *  "never invent colors"; it happens to already be pure white). */
  headingRgb: string;
  wordmarkText: string;
  /** the static CSS wordmark on the choice screen (CR-1). Its rendered
   *  position/size — not a hardcoded formula — are what the particle
   *  formation targets, so the drop reads as the logo "re-forming" in
   *  place rather than assembling somewhere else on screen. */
  wordmarkEl: HTMLElement;
}

/** Ports the reference file's "crisp engine" verbatim: full clears every
 *  frame (no motion-blur smudge), additive (`lighter`) compositing for
 *  particles/rings/waveform, streak-vs-point particle rendering based on
 *  speed, shockwave rings, and the radial drop flash. Only the color
 *  literals changed — reference hardcoded its own concept-demo amber;
 *  this reads the site's real extracted accent/ink tokens instead. */
export class OpenerCanvasEngine {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private DPR = 1;
  private targets: Point[] = [];
  private particles: Particle[] = [];
  private waves: Wave[] = [];
  private fired = new Set<number | string>();
  private flash = 0;
  private idleT = 0;

  constructor(private opts: CanvasEngineOptions) {
    const ctx = opts.canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas context unavailable');
    this.ctx = ctx;
  }

  resize(): void {
    this.DPR = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth;
    this.H = innerHeight;
    this.opts.canvas.width = this.W * this.DPR;
    this.opts.canvas.height = this.H * this.DPR;
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.sampleWordmark();
  }

  /** Renders the wordmark offscreen and samples opaque pixels as particle
   *  formation targets — the same technique the reference uses to make
   *  particles "spell out" the brand at the drop. Position and font size
   *  are read straight from the static CSS wordmark's own box (CR-1: the
   *  drop must land within ~2% of it), not derived from viewport formulas
   *  that could drift out of sync with the actual layout. */
  sampleWordmark(): void {
    const { W, H } = this;
    if (!W || !H) return;
    const rect = this.opts.wordmarkEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = parseFloat(getComputedStyle(this.opts.wordmarkEl).fontSize);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    if (!o) return;
    o.fillStyle = '#fff';
    o.font = `bold ${s}px "Agency FB", Helvetica, Arial, sans-serif`;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText(this.opts.wordmarkText, cx, cy);
    const img = o.getImageData(0, 0, W, H).data;
    const pts: Point[] = [];
    const stride = Math.max(3, Math.round(W / 360));
    for (let y = 0; y < H; y += stride) {
      for (let x = 0; x < W; x += stride) {
        if (img[(y * W + x) * 4 + 3] > 128) pts.push({ x, y });
      }
    }
    this.targets = pts;
  }

  reset(): void {
    this.particles.length = 0;
    this.waves.length = 0;
    this.fired.clear();
    this.flash = 0;
    this.idleT = 0;
  }

  spawnBurst(n: number): void {
    const cy = this.H / 2;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: Math.random() * this.W,
        y: cy + (Math.random() - 0.5) * this.H * 0.1,
        px: 0,
        py: 0,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 5,
        a: 1,
        decay: 0.014 + Math.random() * 0.02,
        target: null,
        size: 0.7 + Math.random() * 1.1,
      });
    }
  }

  spawnFormation(): void {
    this.particles.length = 0;
    const n = Math.min(this.targets.length, 1500);
    const cy = this.H / 2;
    for (let i = 0; i < n; i++) {
      const tg = this.targets[(Math.random() * this.targets.length) | 0];
      const ang = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 10;
      this.particles.push({
        x: this.W / 2,
        y: cy,
        px: this.W / 2,
        py: cy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        target: tg,
        size: 0.9 + Math.random() * 1.1,
        a: 1,
        decay: 0,
      });
    }
  }

  /** Begins the outro drift: particles release their formation target and
   *  float upward/apart, matching the reference's outro transition. */
  releaseParticles(): void {
    for (const p of this.particles) {
      p.target = null;
      p.decay = 0.007 + Math.random() * 0.008;
      p.vx = (Math.random() - 0.5) * 1.2;
      p.vy = -0.4 - Math.random() * 1.1;
    }
  }

  private strokeWave(
    cy: number,
    amp: number,
    t: number,
    analyser: AnalyserNode | null,
    tdata: Uint8Array<ArrayBuffer> | null,
  ): void {
    const { ctx, W } = this;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      let v: number;
      if (analyser && tdata) {
        const i = Math.floor((x / W) * (tdata.length - 1));
        v = ((tdata[i] - 128) / 128) * 1.6;
      } else {
        v = pseudo(x, t) * (0.7 + 0.3 * Math.sin(t * 0.02 + x * 0.001));
      }
      const y = cy + v * amp;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawIdle(dt: number): void {
    this.idleT += dt;
    const { ctx, W, H } = this;
    // clearRect only — no opaque fillRect here. This canvas sits directly
    // on top of the CR-2 studio photo (.opener-photo); an opaque fill
    // painted over it every frame, which meant the photo was never
    // actually visible behind the choice screen despite CR-2 saying it
    // "stays visible through the choice screen and the cue" (found while
    // investigating a user report that the photo wasn't showing).
    ctx.clearRect(0, 0, W, H);
    const cy = H * 0.5 + Math.min(H * 0.18, 150);
    ctx.strokeStyle = `rgba(${this.opts.accentRgb},.45)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = cy + pseudo(x, this.idleT) * 2.2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** @param envAt amplitude/energy at time t — either the synthetic
   *  timeline formula or a decoded-file envelope; the engine doesn't care
   *  which, it only needs a 0–1.6ish number to drive amplitude/brightness. */
  drawPlay(
    t: number,
    T: Timeline,
    envAt: (t: number) => number,
    analyser: AnalyserNode | null,
    tdata: Uint8Array<ArrayBuffer> | null,
    onOutroStart: () => void,
  ): void {
    const { ctx, W, H } = this;
    // same fix as drawIdle() — no opaque fillRect; the CR-2 photo sits
    // behind this canvas for the whole cue, not just from the outro on
    ctx.clearRect(0, 0, W, H);
    const outroing = t >= T.outro;
    const cy = H / 2;
    const e = envAt(t);
    if (analyser && tdata) analyser.getByteTimeDomainData(tdata);

    for (const h of T.thumps) {
      if (t >= h && !this.fired.has(h)) {
        this.fired.add(h);
        this.waves.push({ r: 6, a: 0.45 });
      }
    }
    for (const h of T.hits) {
      if (t >= h && !this.fired.has(h)) {
        this.fired.add(h);
        this.spawnBurst(90);
        this.waves.push({ r: 6, a: 0.35 });
      }
    }
    if (t >= T.drop && !this.fired.has('drop')) {
      this.fired.add('drop');
      this.flash = 1;
      this.waves.push({ r: 8, a: 1 });
      this.waves.push({ r: 2, a: 1, slow: true });
      this.spawnFormation();
    }
    if (outroing && !this.fired.has('outro')) {
      this.fired.add('outro');
      onOutroStart();
      this.releaseParticles();
    }

    // waveform — double-stroke additive, no smudge
    if (t < T.drop + 500) {
      const la = t < T.drop ? 1 : Math.max(0, 1 - (t - T.drop) / 500);
      const amp = Math.min(H * 0.24, 34 + e * 120);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${this.opts.accentRgb},${(0.1 + 0.22 * Math.min(e, 1)) * la})`;
      ctx.lineWidth = 7;
      this.strokeWave(cy, amp, t, analyser, tdata);
      ctx.strokeStyle = `rgba(${this.opts.headingRgb},${(0.5 + 0.5 * Math.min(e, 1)) * la})`;
      ctx.lineWidth = 1.4;
      this.strokeWave(cy, amp, t, analyser, tdata);
      ctx.globalCompositeOperation = 'source-over';
    }

    // shockwave rings
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w2 = this.waves[i];
      w2.r += w2.slow ? 9 : 22;
      w2.a *= w2.slow ? 0.965 : 0.94;
      if (w2.a < 0.02) {
        this.waves.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(${this.opts.accentRgb},${w2.a * 0.8})`;
      ctx.lineWidth = w2.slow ? 1 : 2;
      ctx.beginPath();
      ctx.ellipse(W / 2, cy, w2.r * 1.25, w2.r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // particles — streaks in flight, points at rest
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.px = p.x;
      p.py = p.y;
      if (p.target) {
        p.vx += (p.target.x - p.x) * 0.045;
        p.vy += (p.target.y - p.y) * 0.045;
        p.vx *= 0.78;
        p.vy *= 0.78;
      } else {
        if (!outroing) p.vy += 0.015;
        p.a -= p.decay;
        if (p.a <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
      }
      p.x += p.vx;
      p.y += p.vy;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 1.2) {
        ctx.strokeStyle = `rgba(${this.opts.inkRgb},${Math.min(1, p.a) * 0.85})`;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${this.opts.inkRgb},${Math.min(1, p.a) * 0.95})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // drop flash
    if (this.flash > 0) {
      const g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, Math.max(W, H) * 0.7);
      g.addColorStop(0, `rgba(${this.opts.headingRgb},${this.flash * 0.85})`);
      g.addColorStop(0.4, `rgba(${this.opts.accentRgb},${this.flash * 0.35})`);
      g.addColorStop(1, `rgba(${this.opts.accentRgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      this.flash *= 0.86;
      if (this.flash < 0.02) this.flash = 0;
    }
  }
}
