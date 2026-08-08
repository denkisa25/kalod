/** CR-002 §3 — <stem-player> custom element.
 *
 *  Vanilla custom element by §0.6: no framework wrapper. React re-renders
 *  touching audio state are a bug class we are deliberately avoiding.
 *
 *  Config arrives as JSON on a data attribute rather than being fetched here,
 *  so the Astro page can resolve asset URLs through withBase() and this file
 *  never has to guess the configured base path.
 */
import { getAudioContext, isAudioSupported, resumeAudio } from '../../scripts/audio-context';
import {
  createPicture,
  timecode,
  VideoPicture,
  type PictureConfig,
  type PictureSource,
} from './picture-source';
import {
  BUDGET_S,
  LOCK_S,
  MASTER_CEILING,
  StemGraph,
  Transport,
  clamp,
  decodeStems,
  fetchWithProgress,
  type StemDef,
} from './stem-engine';

interface PieceConfig {
  slug: string;
  title: string;
  note?: string;
  picture: PictureConfig;
  offsetMs: number;
  fallback: string;
  stems: StemDef[];
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** `?picture=canvas` / `?picture=video` overrides stems.json for the run.
 *  The point is A/B-ing the same transport against a synthetic clock and a
 *  real decoder without editing config between attempts — the canvas is the
 *  control, since its behaviour is already characterised. */
function pictureOverride(): 'canvas' | 'video' | null {
  const v = new URLSearchParams(location.search).get('picture');
  return v === 'canvas' || v === 'video' ? v : null;
}

class StemPlayerElement extends HTMLElement {
  #cfg!: PieceConfig;
  #graph: StemGraph | null = null;
  #picture: PictureSource | null = null;
  #transport: Transport | null = null;
  #buffers: Map<string, AudioBuffer> | null = null;
  #on = new Map<string, boolean>();
  #raf = 0;
  #loading = false;
  #scrubbing = false;
  #meterBuf = new Float32Array(new ArrayBuffer(256 * 4));
  #reduceMotion = false;

  // resolved once in connectedCallback so the render loop never queries the DOM
  #els: Record<string, HTMLElement> = {};

  connectedCallback(): void {
    const raw = this.dataset.config;
    if (!raw) {
      console.error('[stem-player] missing data-config');
      return;
    }
    this.#cfg = JSON.parse(raw) as PieceConfig;
    for (const s of this.#cfg.stems) this.#on.set(s.id, true);

    const mq = window.matchMedia(REDUCED_MOTION);
    this.#reduceMotion = mq.matches;
    mq.addEventListener('change', (e) => {
      this.#reduceMotion = e.matches;
      if (e.matches) this.#clearMeters();
    });

    // §3.3 — the page must never show a dead control surface. If Web Audio
    // is unavailable at all, go straight to the summed-file fallback and
    // never build a mixer the visitor cannot use.
    if (!isAudioSupported() || !getAudioContext()) {
      this.#renderFallback('this browser does not support the web audio api.');
      return;
    }

    this.#render();
    this.#wire();
    this.#tick();
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    this.#transport?.dispose();
    this.#picture?.dispose();
  }

  /* ---------------------------------------------------------------- markup */

  #render(): void {
    const { title, note, stems } = this.#cfg;
    this.innerHTML = `
      <div class="sp">
        <div class="sp-head">
          <h2 class="sp-title">${title}</h2>
          <p class="sp-badge">placeholder audio</p>
        </div>
        ${note ? `<p class="sp-note">${note}</p>` : ''}

        <!-- host only: createPicture() injects the canvas or video surface -->
        <div class="sp-picture" part="picture"></div>

        <div class="sp-loader" hidden>
          <div class="sp-bar"><i></i></div>
          <p class="sp-loadmsg">loading stems…</p>
        </div>
        <p class="sp-error" role="alert" hidden></p>

        <div class="sp-transport">
          <button class="sp-play" type="button">play</button>
          <button class="sp-rewind" type="button" disabled>to start</button>
          <input class="sp-scrub" type="range" min="0" max="1" step="0.001" value="0"
                 disabled aria-label="playback position">
          <p class="sp-time"><span class="sp-pos">00:00.000</span> / <span class="sp-dur">00:00.000</span></p>
        </div>

        <div class="sp-stems" role="group" aria-label="stems">
          ${stems
            .map(
              (s) => `
            <div class="sp-stem">
              <button class="sp-toggle" type="button" data-stem="${s.id}" aria-pressed="true">
                ${s.label}
              </button>
              <div class="sp-meter" data-meter="${s.id}" aria-hidden="true"><i></i></div>
            </div>`,
            )
            .join('')}
        </div>

        <div class="sp-master">
          <label class="sp-label" for="sp-vol-${this.#cfg.slug}">master</label>
          <input class="sp-vol" id="sp-vol-${this.#cfg.slug}" type="range"
                 min="0" max="1" step="0.01" value="1" aria-label="master volume">
          <!-- aria-live off: <output> is an implicit live region, and a value
               that changes on every pointermove would spam a screen reader.
               The slider already announces its own value. -->
          <output class="sp-volval" aria-live="off">${MASTER_CEILING.toFixed(2)}</output>
        </div>

        <p class="sp-hint">space play/pause · ← → seek 5s · m mute all</p>
      </div>`;

    const q = <T extends HTMLElement>(sel: string) => this.querySelector(sel) as T;
    this.#els = {
      picture: q('.sp-picture'),
      loader: q('.sp-loader'),
      bar: q('.sp-bar > i'),
      loadmsg: q('.sp-loadmsg'),
      error: q('.sp-error'),
      play: q('.sp-play'),
      rewind: q('.sp-rewind'),
      scrub: q('.sp-scrub'),
      pos: q('.sp-pos'),
      dur: q('.sp-dur'),
      vol: q('.sp-vol'),
      volval: q('.sp-volval'),
    };
    (this.#els.dur as HTMLElement).textContent = timecode(this.#cfg.picture.duration);
  }

  /** §3.3 — hide the mixer, play a single summed file. */
  #renderFallback(reason: string): void {
    const src = this.#cfg.fallback;
    this.innerHTML = `
      <div class="sp sp--fallback">
        <div class="sp-head">
          <h2 class="sp-title">${this.#cfg.title}</h2>
          <p class="sp-badge">placeholder audio</p>
        </div>
        <p class="sp-note">${reason} playing the summed mix instead — the individual
        stems need the web audio api.</p>
        <audio class="sp-audio" controls preload="metadata" src="${src}"></audio>
      </div>`;
  }

  /* ---------------------------------------------------------------- wiring */

  #wire(): void {
    const els = this.#els;

    els.play.addEventListener('click', () => void this.#togglePlay());
    els.rewind.addEventListener('click', () => this.#transport?.seek(0));

    // Scrubbing commits on `change`, not `input`: every seek rebuilds all
    // four sources, and doing that per pointermove makes the transport feel
    // broken.
    els.scrub.addEventListener('input', () => {
      this.#scrubbing = true;
      els.pos.textContent = timecode(Number((els.scrub as HTMLInputElement).value));
    });
    els.scrub.addEventListener('change', () => {
      this.#scrubbing = false;
      this.#transport?.seek(Number((els.scrub as HTMLInputElement).value));
    });

    els.vol.addEventListener('input', () => {
      const v = Number((els.vol as HTMLInputElement).value) * MASTER_CEILING;
      this.#graph?.setMaster(v);
      (els.volval as HTMLOutputElement).value = v.toFixed(2);
    });

    this.querySelectorAll<HTMLButtonElement>('.sp-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.stem!;
        const on = !this.#on.get(id);
        this.#on.set(id, on);
        btn.setAttribute('aria-pressed', String(on));
        this.#graph?.setStem(id, on);
      });
    });

    // Keyboard (§3.3 — full keyboard operation). Scoped to this element so
    // the lab page's shortcuts never hijack typing elsewhere.
    this.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.type === 'range') {
        if (e.key === ' ') {
          // let space reach our transport rather than nudging the slider
          e.preventDefault();
          void this.#togglePlay();
        }
        return; // arrows belong to the slider
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          void this.#togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.#nudge(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.#nudge(5);
          break;
        case 'm':
        case 'M': {
          e.preventDefault();
          const anyOn = [...this.#on.values()].some(Boolean);
          this.querySelectorAll<HTMLButtonElement>('.sp-toggle').forEach((b) => {
            const id = b.dataset.stem!;
            this.#on.set(id, !anyOn);
            b.setAttribute('aria-pressed', String(!anyOn));
            this.#graph?.setStem(id, !anyOn);
          });
          break;
        }
      }
    });
  }

  #nudge(sec: number): void {
    const tr = this.#transport;
    if (!tr) return;
    tr.seek(clamp(tr.position + sec, 0, tr.duration));
  }

  /* --------------------------------------------------------------- loading */

  async #togglePlay(): Promise<void> {
    if (this.#loading) return;
    if (this.#transport) {
      if (this.#transport.playing) this.#transport.pause();
      else void this.#transport.play();
      return;
    }
    await this.#load();
  }

  /** Deferred until the first play click: that click is the gesture that
   *  unlocks audio (§3.3 — do not add a second gate), and it also means a
   *  visitor who never presses play never decodes 73 MB of audio. */
  async #load(): Promise<void> {
    const els = this.#els;
    this.#loading = true;
    els.loader.hidden = false;
    els.error.hidden = true;
    (els.play as HTMLButtonElement).disabled = true;

    try {
      const ctx = await resumeAudio();
      if (!ctx) throw new Error('no audio context');

      const stems = this.#cfg.stems;
      const prog = stems.map(() => ({ received: 0, total: 0 }));
      const paint = () => {
        const got = prog.reduce((a, p) => a + p.received, 0);
        const all = prog.reduce((a, p) => a + p.total, 0);
        (els.bar as HTMLElement).style.width = all ? `${(got / all) * 100}%` : '0%';
        els.loadmsg.textContent = `${(got / 1048576).toFixed(2)} mb / ${(all / 1048576).toFixed(2)} mb across ${stems.length} stems`;
      };

      const arrays = await Promise.all(
        stems.map((s, i) =>
          fetchWithProgress(s.src, (r, t) => {
            prog[i] = { received: r, total: t };
            paint();
          }),
        ),
      );

      els.loadmsg.textContent = 'decoding…';
      this.#buffers = await decodeStems(ctx, stems, arrays);

      this.#graph = new StemGraph(ctx, stems);

      // Duration comes from the decoded buffers, never from the picture —
      // the audio is the clock master, so its length is the piece's length.
      const pictureCfg: PictureConfig = {
        ...this.#cfg.picture,
        type: pictureOverride() ?? this.#cfg.picture.type,
        duration: this.#buffers.get(stems[0].id)!.duration,
      };
      this.#picture = createPicture(pictureCfg, els.picture);
      this.dataset.picture = pictureCfg.type;
      this.#transport = new Transport(
        ctx,
        this.#graph,
        this.#picture,
        stems,
        this.#buffers,
        this.#cfg.offsetMs,
      );

      const dur = this.#transport.duration;
      (els.scrub as HTMLInputElement).max = String(dur);
      (els.scrub as HTMLInputElement).disabled = false;
      (els.rewind as HTMLButtonElement).disabled = false;
      els.dur.textContent = timecode(dur);
      els.loader.hidden = true;

      await this.#transport.play(0);
    } catch (err) {
      // §3.3 — a decode failure must land on the summed file, not on a dead
      // control surface.
      console.error('[stem-player]', err);
      this.#renderFallback('the stems could not be loaded.');
      return;
    } finally {
      this.#loading = false;
      const play = this.#els.play as HTMLButtonElement | undefined;
      if (play) play.disabled = false;
    }
  }

  /* ------------------------------------------------------------- rendering */

  #clearMeters(): void {
    this.querySelectorAll<HTMLElement>('.sp-meter > i').forEach((i) => {
      i.style.transform = 'scaleX(0)';
    });
  }

  #tick = (): void => {
    this.#raf = requestAnimationFrame(this.#tick);
    const tr = this.#transport;
    if (!tr) return;

    // End of media — detected here rather than via onended, which also fires
    // on every teardown (see Transport.disposeSources).
    if (tr.playing && tr.position >= tr.duration - 0.001) tr.pause();

    const els = this.#els;
    (els.play as HTMLButtonElement).textContent = tr.playing ? 'pause' : 'play';
    if (!this.#scrubbing) {
      (els.scrub as HTMLInputElement).value = String(tr.position);
      els.pos.textContent = timecode(tr.position);
    }

    // §3.3 — prefers-reduced-motion disables the level-meter animation.
    // The toggles keep working; only the animation stops.
    if (!this.#reduceMotion && this.#graph) {
      for (const s of this.#cfg.stems) {
        const meter = this.querySelector<HTMLElement>(`[data-meter="${s.id}"] > i`);
        if (!meter) continue;
        const peak = this.#graph.level(s.id, this.#meterBuf);
        meter.style.transform = `scaleX(${clamp(peak * 3, 0, 1).toFixed(3)})`;
      }
    }

    this.dataset.zone = tr.zone;
    this.dataset.drift = (tr.drift * 1000).toFixed(1);
  };

  /* Exposed for the verification pass — asserting on real engine state beats
     asserting on rendered text. */
  get debug() {
    const tr = this.#transport;
    const pic = this.#picture;
    const vid = pic instanceof VideoPicture ? pic : null;
    return {
      pictureType: this.dataset.picture ?? null,
      pictureTime: pic?.currentTime ?? null,
      // readyState < 3 (HAVE_FUTURE_DATA) mid-playback means the element is
      // starving — drift about to grow for a reason that is not the corrector
      videoReadyState: vid?.readyState ?? null,
      videoRate: vid?.rate ?? null,
      playing: tr?.playing ?? false,
      sources: tr?.sources.length ?? 0,
      position: tr?.position ?? 0,
      driftMs: (tr?.drift ?? 0) * 1000,
      zone: tr?.zone ?? null,
      latencyCompMs: (tr?.latencyComp ?? 0) * 1000,
      stats: tr?.stats ?? null,
      masterGain: this.#graph?.master.gain.value ?? null,
      gains: this.#graph
        ? Object.fromEntries([...this.#graph.stemGains].map(([k, g]) => [k, g.gain.value]))
        : null,
      budgetS: BUDGET_S,
      lockS: LOCK_S,
    };
  }
}

if (!customElements.get('stem-player')) {
  customElements.define('stem-player', StemPlayerElement);
}

export { StemPlayerElement };
