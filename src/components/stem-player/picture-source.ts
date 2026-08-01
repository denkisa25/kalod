/** CR-002 §1 — the picture abstraction.
 *
 *  CanvasPicture now, VideoPicture (hls.js, Cloudflare Stream) later. Swapping
 *  to Stream must touch one factory call, not the engine: nothing in
 *  stem-engine.ts may reference CanvasPicture or any canvas concept.
 *
 *  Note what is deliberately NOT on this interface: duration, and any notion
 *  of readiness or buffering. The transport owns duration (it comes from the
 *  decoded buffers, which are the clock master), and a VideoPicture that
 *  stalls is handled by the drift loop's resync zone rather than by the
 *  engine asking the picture how it feels.
 */
export interface PictureSource {
  readonly currentTime: number;
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void; // no-op for canvas-with-no-media; real for video
  dispose(): void;
}

const PICTURE_FPS = 25; // picture frame counter / flash width
const FLASH_AT = 1.0; // §2.3 — coincides with the 1 kHz burst in every stem
const FLASH_FRAMES = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function timecode(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** The Stage 1/2 stand-in for real picture.
 *
 *  Advances on performance.now() deltas — deliberately NOT the audio clock
 *  (§2.3) — so the drift-correction loop has something real to correct
 *  against. A canvas slaved to ctx.currentTime would make the loop untestable
 *  and would hide exactly the class of bug this whole stage exists to find.
 */
export class CanvasPicture implements PictureSource {
  #t = 0;
  #rate = 1;
  #running = false;
  #last = 0;
  #raf = 0;
  #fps = 0;
  #frames = 0;
  #fpsAt = 0;
  #g: CanvasRenderingContext2D | null;

  /* Canvas takes colour strings, not custom properties, so token values are
     READ from the cascade rather than duplicated as literals — the draw can
     never drift from tokens.css (TOKEN-GUARD).
     PICTURE_BG and FLASH are deliberately not tokens: pure black is the
     cinema surface (the same #000 global.css already uses behind video), and
     the flash is a measurement instrument that has to be maximum luminance,
     not a brand colour. */
  static readonly PICTURE_BG = '#000';
  static readonly FLASH = '#fff';
  #tok = { accent: '#fff', heading: '#fff', ink: '#fff' };

  constructor(
    private canvas: HTMLCanvasElement,
    public readonly duration: number,
  ) {
    this.#g = canvas.getContext('2d');
    const cs = getComputedStyle(canvas);
    const tok = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    this.#tok = {
      accent: tok('--color-accent', '#fff'),
      heading: tok('--color-heading', '#fff'),
      ink: tok('--color-ink', '#fff'),
    };
    this.#last = performance.now();
    this.#fpsAt = this.#last;
    this.#raf = requestAnimationFrame(this.#tick);
  }

  get currentTime(): number {
    return this.#t;
  }
  get rate(): number {
    return this.#rate;
  }
  get fps(): number {
    return this.#fps;
  }

  play(): Promise<void> {
    this.#running = true;
    this.#last = performance.now();
    return Promise.resolve();
  }
  pause(): void {
    this.#running = false;
  }
  seek(t: number): void {
    this.#t = clamp(t, 0, this.duration);
  }
  setRate(r: number): void {
    this.#rate = r;
  }
  dispose(): void {
    cancelAnimationFrame(this.#raf);
    this.#running = false;
    this.#g = null;
  }

  /* a bound field, not a method: private methods are not writable, so the
     usual constructor .bind() throws at construction. */
  #tick = (now: number): void => {
    this.#raf = requestAnimationFrame(this.#tick);
    const dt = (now - this.#last) / 1000;
    this.#last = now;
    if (this.#running) this.#t = clamp(this.#t + dt * this.#rate, 0, this.duration);

    this.#frames++;
    if (now - this.#fpsAt >= 500) {
      this.#fps = Math.round((this.#frames * 1000) / (now - this.#fpsAt));
      this.#frames = 0;
      this.#fpsAt = now;
    }
    this.#draw();
  };

  #draw(): void {
    const g = this.#g;
    if (!g) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (
      this.canvas.width !== Math.round(w * dpr) ||
      this.canvas.height !== Math.round(h * dpr)
    ) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = this.#t;
    // full-screen white flash for 2 picture frames at exactly t=1.000s (§2.3).
    // paired with the 1 kHz burst, this is how A/V alignment is verified by
    // eye and ear, and how the constant offset is measured once real assets
    // bring AAC priming delay into the picture.
    const flashing = t >= FLASH_AT && t < FLASH_AT + FLASH_FRAMES / PICTURE_FPS;

    const C = CanvasPicture;
    g.fillStyle = flashing ? C.FLASH : C.PICTURE_BG;
    g.fillRect(0, 0, w, h);

    // during the flash everything inverts to stay legible against white
    const fg = flashing ? C.PICTURE_BG : this.#tok.heading;
    const dim = flashing ? C.PICTURE_BG : this.#tok.accent;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.font = `${Math.round(h * 0.22)}px 'Agency FB', 'Bahnschrift', 'Arial Narrow', sans-serif`;
    g.fillText(timecode(t), w / 2, h * 0.44);

    g.fillStyle = dim;
    g.font = `${Math.round(h * 0.07)}px Verdana, Geneva, sans-serif`;
    g.fillText(
      `frame ${String(Math.floor(t * PICTURE_FPS)).padStart(5, '0')} @ ${PICTURE_FPS}fps`,
      w / 2,
      h * 0.66,
    );

    // sync marker + playhead — motion here is what makes drift visible by eye
    const pad = w * 0.06;
    const span = w - pad * 2;
    const y = h * 0.86;
    g.strokeStyle = flashing ? C.PICTURE_BG : this.#tok.ink;
    g.globalAlpha = flashing ? 1 : 0.25;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pad, y);
    g.lineTo(pad + span, y);
    g.stroke();

    g.globalAlpha = 1;

    const syncX = pad + span * (FLASH_AT / this.duration);
    g.strokeStyle = dim;
    g.beginPath();
    g.moveTo(syncX, y - h * 0.03);
    g.lineTo(syncX, y + h * 0.03);
    g.stroke();

    const headX = pad + span * clamp(t / this.duration, 0, 1);
    g.strokeStyle = dim;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(headX, y - h * 0.06);
    g.lineTo(headX, y + h * 0.06);
    g.stroke();
  }
}
