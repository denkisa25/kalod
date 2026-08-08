/** CR-002 §1 — the picture abstraction.
 *
 *  CanvasPicture now, VideoPicture (hls.js, Cloudflare Stream) later. Swapping
 *  to Stream must touch one factory call, not the engine: nothing in
 *  stem-engine.ts may reference CanvasPicture or any canvas concept.
 *
 *  Note what is deliberately NOT on this interface: duration, and any notion
 *  of MID-PLAYBACK buffering. The transport owns duration (it comes from the
 *  decoded buffers, which are the clock master), and a VideoPicture that
 *  stalls while running is handled by the drift loop's resync zone rather
 *  than by the engine asking the picture how it feels.
 *
 *  `ready()` is the one exception, and only covers startup — see the note on
 *  it below for why a canvas never needed it and a video does.
 */
export interface PictureSource {
  readonly currentTime: number;
  /** Resolves when the picture can start from its current position without
   *  immediately stalling.
   *
   *  DEVIATION from CR-002 §1, which does not list this. §1's interface was
   *  written when the only implementation was a canvas, which is always ready,
   *  so the gap never surfaced. A real video element is not: scheduling audio
   *  against an unbuffered video makes the picture start late by however long
   *  it takes to decode the first frames, and the corrector then has to claw
   *  that back at the top of every playback.
   *
   *  Deliberately still no readiness signal for MID-playback stalls — those
   *  stay the drift loop's problem via the resync zone, so the engine never
   *  has to ask the picture how it feels once running. */
  ready(): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void; // no-op for canvas-with-no-media; real for video
  dispose(): void;
}

export interface PictureConfig {
  type: 'canvas' | 'video';
  duration: number;
  src?: string;
}

/** CR-002 §1 — the one call that changes when Cloudflare Stream arrives.
 *  A `VideoPicture` fed an HLS manifest through hls.js slots in here; nothing
 *  in stem-engine.ts is touched. */
export function createPicture(cfg: PictureConfig, host: HTMLElement): PictureSource {
  if (cfg.type === 'video') {
    if (!cfg.src) throw new Error('picture.type "video" requires picture.src');
    return new VideoPicture(host, cfg.src, cfg.duration);
  }
  return new CanvasPicture(host, cfg.duration);
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

  private canvas: HTMLCanvasElement;

  constructor(host: HTMLElement, public readonly duration: number) {
    const canvas = document.createElement('canvas');
    canvas.className = 'sp-surface';
    host.replaceChildren(canvas);
    this.canvas = canvas;

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

  /** Always ready — a canvas has nothing to buffer. */
  ready(): Promise<void> {
    return Promise.resolve();
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

/** Real picture, driven by a muted <video> element.
 *
 *  Muted is not a preference — it is what keeps CR-002 §5 cheap. No
 *  createMediaElementSource means no CORS tainting of the element, and it
 *  means iOS can fall back to native HLS at no cost. The audio graph is the
 *  clock master; this element never contributes a sample.
 *
 *  The Cloudflare Stream swap replaces the `src` assignment with an hls.js
 *  attach. Nothing else in this class, and nothing at all in stem-engine.ts,
 *  needs to change.
 */
export class VideoPicture implements PictureSource {
  #video: HTMLVideoElement;
  #readyTimeoutMs = 8000;

  constructor(host: HTMLElement, src: string, public readonly duration: number) {
    const v = document.createElement('video');
    v.className = 'sp-surface';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true; // iOS: play in place rather than taking over fullscreen
    v.preload = 'auto';
    v.controls = false;
    v.disablePictureInPicture = true;
    v.src = src;
    host.replaceChildren(v);
    this.#video = v;
  }

  get currentTime(): number {
    return this.#video.currentTime;
  }
  get rate(): number {
    return this.#video.playbackRate;
  }
  /** Exposed so the HUD can show that a stall is the picture's fault, not the
   *  corrector's. readyState < HAVE_FUTURE_DATA during playback means the
   *  element is starving and drift is about to grow. */
  get readyState(): number {
    return this.#video.readyState;
  }
  get element(): HTMLVideoElement {
    return this.#video;
  }

  /** Resolves once the element can play forward from where it is sitting.
   *
   *  Times out rather than hanging: a picture that never becomes ready must
   *  not deadlock the transport. Starting late and letting the corrector pull
   *  it in is strictly better than a play button that does nothing. */
  ready(): Promise<void> {
    const v = this.#video;
    if (v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeEventListener('canplay', finish);
        v.removeEventListener('error', finish);
        resolve();
      };
      const timer = setTimeout(() => {
        console.warn(
          `[stem-player] picture not ready after ${this.#readyTimeoutMs} ms ` +
            `(readyState ${v.readyState}) — starting anyway; the drift loop will correct.`,
        );
        finish();
      }, this.#readyTimeoutMs);
      v.addEventListener('canplay', finish);
      v.addEventListener('error', finish);
    });
  }

  async play(): Promise<void> {
    try {
      await this.#video.play();
    } catch (err) {
      // A muted, playsinline element is not subject to the autoplay gate, so
      // this is a real failure (decode error, source gone) rather than policy.
      console.error('[stem-player] picture failed to start', err);
    }
  }

  pause(): void {
    this.#video.pause();
  }

  seek(t: number): void {
    this.#video.currentTime = Math.min(Math.max(t, 0), this.duration);
  }

  /** The corrector's only lever. Range is well inside what every engine
   *  supports, and with the element muted there is no pitch artefact to
   *  worry about. */
  setRate(r: number): void {
    this.#video.playbackRate = r;
  }

  dispose(): void {
    this.#video.pause();
    this.#video.removeAttribute('src');
    this.#video.load(); // releases the decoder and any buffered data
    this.#video.remove();
  }
}
