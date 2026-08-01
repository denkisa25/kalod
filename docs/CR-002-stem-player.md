# CR-002 — Stem player

**Target repo:** kalodimitrov redesign (Astro), branch `stem-player`
**Review surface:** `kalodimitrov.com/new`
**Companion docs:** TOKEN-GUARD.md, cr-001-visual.md
**Status:** Stage 1 ready to execute. No Cloudflare Stream or R2 subscription yet — all Stage 1 and 2 assets are local and same-origin.

---

## How to use this document with Claude Code

Each stage is a separate session. Do not run them in one pass — Stage 1 needs
listening and eyeballing between iterations, which is not something to batch.

Session prompts are in §7. Read §0 before the first one.

---

## §0 Rules for this CR

Claude Code must follow these throughout. They exist because of specific
failure modes, not as general good practice.

1. **Master gain ceiling.** Every graph terminates in a master `GainNode`
   clamped to `0.5` maximum, followed by a `DynamicsCompressorNode` configured
   as a limiter (`threshold: -6`, `ratio: 20`, `attack: 0.003`, `release: 0.1`).
   Never route a source directly to `ctx.destination`. This is not optional —
   a mis-scaled oscillator at full scale through studio monitors is the one
   accident that ends this project.
2. **One AudioContext, ever.** Singleton on `window`, with explicit HMR
   disposal. Ghost contexts produce doubled playback that presents as a
   phantom sync bug and wastes hours.
3. **No placeholder design tokens.** Read TOKEN-GUARD.md before writing any
   CSS. Real extracted values only.
4. **Do not route anything into the live `/new` navigation** until Stage 3.
   No nav links, no sitemap entries, `noindex` on the lab route.
5. **Do not commit to the deploy branch.** All work on `stem-player`.
6. **Do not install a framework wrapper for the audio engine.** Vanilla
   custom element. React re-renders touching audio state are a bug class we
   are deliberately avoiding.

---

## §1 Architecture

| Layer | Stage 1–2 (now) | Stage 3+ (later) |
|---|---|---|
| Picture | Canvas stand-in | Cloudflare Stream, HLS, muted |
| Stems | Local `.m4a`, same-origin | Cloudflare R2 + CORS |
| Mixing | Web Audio API | unchanged |
| Clock master | `AudioContext` | unchanged |

Stems cannot be Stream audio tracks — HLS rendition groups are mutually
exclusive by spec, and Stream downmixes multichannel on ingest. This is
settled; do not revisit it during implementation.

**Picture abstraction.** Build against a `PictureSource` interface from the
start, with two implementations:

```ts
interface PictureSource {
  readonly currentTime: number;
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void;   // no-op for canvas
  dispose(): void;
}
```

`CanvasPicture` now, `VideoPicture` (hls.js) later. Swapping to Stream then
touches one factory call, not the engine.

---

## §2 Stage 1 — Standalone lab

Isolated from Astro entirely. No build step, no HMR, no framework. Iterates
on hard refresh.

### 2.1 Files

```
lab/
  stem-lab.html          # single file: markup, styles, engine
  assets/stems/
    pad.m4a  pulse.m4a  ambience.m4a  melody.m4a
  make-stems.sh
```

`lab/` sits at repo root — outside `src/` and outside `public/`, so Astro
never routes it.

### 2.2 Generate synthetic stems

`lab/make-stems.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/assets/stems"
D=50   # seconds
R=48000

# Sync transient: 1 kHz burst at exactly t=1.000s in every stem.
SYNC="sine=f=1000:r=$R:d=0.05"

enc() { ffmpeg -y -hide_banner -loglevel error \
  -filter_complex "$1" -map "[out]" \
  -ac 2 -ar $R -c:a aac -b:a 128k -movflags +faststart "$2"; }

# Pad — low sustained fifth
enc "sine=f=110:r=$R:d=$D[a];sine=f=164.81:r=$R:d=$D[b];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][b][s]amix=inputs=3:normalize=0,volume=0.18,\
aformat=channel_layouts=stereo[out]" pad.m4a

# Pulse — gated click at 2 Hz
enc "sine=f=880:r=$R:d=$D,tremolo=f=2:d=1[a];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][s]amix=inputs=2:normalize=0,volume=0.15,\
aformat=channel_layouts=stereo[out]" pulse.m4a

# Ambience — filtered pink noise bed
enc "anoisesrc=color=pink:r=$R:d=$D,lowpass=f=800[a];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][s]amix=inputs=2:normalize=0,volume=0.12,\
aformat=channel_layouts=stereo[out]" ambience.m4a

# Melody — slow swelling tone
enc "sine=f=329.63:r=$R:d=$D,tremolo=f=0.5:d=0.9[a];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][s]amix=inputs=2:normalize=0,volume=0.14,\
aformat=channel_layouts=stereo[out]" melody.m4a

for f in *.m4a; do
  printf "%-14s %s\n" "$f" "$(ffprobe -v error -show_entries \
    format=duration -of csv=p=0 "$f")"
done
```

Verify the four durations print identical to at least 3 decimal places. If
they don't, the buffers will be different lengths and the null test in §6
will never pass.

Levels are deliberately low (0.12–0.18) so all four summed stay well clear
of 0 dBFS. Do not raise them.

### 2.3 Canvas picture stand-in

`CanvasPicture` renders, at 60fps via rAF:

- Large timecode readout (`MM:SS.mmm`)
- A frame counter
- **A full-screen white flash for 2 frames at exactly t=1.000s**, matching the
  1 kHz burst in the stems

The flash-against-burst pair is how you verify A/V alignment by eye and ear
before there is any real video. It also gives you the constant offset to bake
in later when AAC priming delay enters the picture with real assets.

Canvas advances on its own rAF clock — deliberately *not* the audio clock —
so the drift-correction loop has something real to correct against.

### 2.4 Engine

- **Load:** `fetch` all four in parallel → `decodeAudioData` → hold buffers.
  Real progress indicator, not a spinner. Assert all buffers report identical
  `length`; throw loudly if not.
- **Play:** schedule all sources at shared `t0 = ctx.currentTime + 0.15`,
  start picture, begin drift loop.
- **Toggle:** `gain.linearRampToValueAtTime(target, ctx.currentTime + 0.05)`.
  Never assign `.value` directly.
- **Drift loop** (500 ms interval). *Amended after the Stage 1 measurement pass
  — see 2.4a for the data that forced each change.*
  ```
  latencyComp = ctx.baseLatency + ctx.outputLatency      // device, read live
  expected    = ctx.currentTime - latencyComp - t0
              + startOffset + offsetMs/1000              // offsetMs = content (§6)
  drift       = picture.currentTime - expected

  |drift| <  10 ms  → rate = 1                            // locked
  |drift| < 400 ms  → rate = clamp(1 - drift/1.0, 0.95, 1.05)
  |drift| >= 400 ms → log + hard resync (picture.seek(expected))
  ```
  The first two zones correct by **rate only and never seek** — that is what
  survives the swap to HLS, where a seek costs a rebuffer. The third zone
  deliberately does seek: above 400 ms something discontinuous has happened (a
  stall, a device switch, a backgrounded tab) and no rate nudge recovers it in
  reasonable time. Resyncs are counted so a player that resyncs repeatedly is
  visible rather than silent.

  **The correction deadband (10 ms) and the acceptance budget (40 ms, §2.7)
  are different numbers.** The original spec used 0.04 for both, which let the
  corrector stop the moment it entered the budget and park at its edge — a
  permanent 27 ms desync that still passed the acceptance check.

### 2.4a Measured basis for the amendment

Full 50 s runs, drift sampled every 500 ms, canvas picture, Chrome / macOS.

| | original §2.4 | amended |
|---|---|---|
| settled mean drift | **+27.5 ms** | **+3.2 ms** |
| settled range | 24.1 – 30.6 ms | 0.2 – 6.6 ms |
| recovery from a 150 ms disturbance | 7.5 s | **4.0 s** |
| samples over the 40 ms budget | — | 1 of 99 (cold-start only) |

1. **Output latency is the dominant error and must be compensated at the
   source.** Audio scheduled at `ctx.currentTime` is not *audible* until
   `baseLatency + outputLatency` later, while the canvas paints immediately.
   Measured 45.33 ms here (outputLatency 40 + baseLatency 5.33), matching the
   uncompensated opening drift of 44.4 ms to within a millisecond. It is
   device-dependent and changes when the user switches output, so it is read
   live, never baked. It is kept **separate from `offsetMs`**, which stays the
   content-side AAC priming constant of §6: one is the device, one is the asset.
2. **The residual is a real sawtooth, but not a limit cycle.** Period 2.0 s,
   6.5 ms peak-to-peak, RMS 1.6 ms (autocorrelation lag-4 +0.37, lag-8 +0.53,
   lag-2 −0.33). It persists with the corrector *inert* — all 79 settled
   samples reported `rate === 1` in the lock zone — so it is a clock/sampling
   artifact, not feedback. Regression slope −0.02 ms/s (≈1 ms across 50 s):
   the rAF and audio clocks agree to ~30 ppm and nothing accumulates.
3. **Do not lower the lock zone below ~10 ms.** It sits just above that 6.5 ms
   artifact floor. Chasing the artifact *would* create a genuine limit cycle.
   If a slower machine shows a larger artifact, median-filter the drift
   measurement over 3 samples rather than widening the zone.
4. **Gain choice.** Recovery from a 150 ms disturbance: tau 2.0 → 6.0 s with a
   re-entry into correction after locking; tau 1.0 → 4.0 s, no overshoot, no
   re-entry; tau 0.75 → 3.5 s but overshoots past zero. Each 500 ms tick closes
   `0.5/tau` of the error, so tau must stay well above the 0.5 s sample
   interval or the loop rings. **tau = 1.0.**
5. **Cold-start transient.** Chrome reports `outputLatency` as 0 until the
   audio device is open, so the very first tick of the very first playback is
   uncompensated (60.8 ms, locking within 2 s). With the context already
   running it opens at 33.4 ms and locks in 1.5 s with no budget breach. In
   Stage 2 the "this site is meant to be heard" gate resumes the context long
   before playback, so the device is warm by then.
- **Seek/pause:** tear down and rebuild every source.
  `AudioBufferSourceNode` is single-use. Build the transport around this now —
  retrofitting it later means rewriting the transport.

### 2.5 Debug HUD

Always visible in the lab. Non-negotiable — without it you are guessing.

| Field | Why |
|---|---|
| `ctx.currentTime`, expected pos, picture pos | raw clock comparison |
| drift (ms), current `playbackRate` | is correction converging or oscillating |
| latency comp (ms) | the device constant; if it reads 0 the loop is uncompensated |
| zone (lock / correct / resync) | which of the three §2.4 branches is active |
| locked vs correcting seconds, hard-resync count | a player that never locks, or resyncs repeatedly, must be loud about it |
| samples over the 40 ms budget | acceptance measured continuously, not once |
| decoded MB total, per-buffer sample count | memory budget, length equality |
| per-stem gain value | confirms ramps land at 0 and 1 |
| live source count (0 or 4, never between) | catches teardown leaks on seek |
| context state | catches suspended-context confusion |

### 2.6 Run it

```bash
npx serve lab -l 4322
```

Separate port from Astro's 4321. Do not open via `file://` — `fetch` of local
audio will fail on the origin check.

### 2.7 Stage 1 acceptance

- [ ] Four buffers decode, identical sample counts asserted
- [ ] Burst and flash coincide by eye and ear at t=1.000s
- [ ] Toggling any stem is inaudible as a click; only the stem changes
- [ ] Drift stays inside the **±40 ms acceptance budget** across a full 50 s
      playthrough. This is the pass/fail bar, and it is deliberately *not* the
      10 ms correction deadband of §2.4 — a corrector allowed to stop at 40 ms
      will park there. Report settled mean drift, not just the maximum: a run
      whose maximum is 30 ms but whose mean is 27 ms has a standing offset, not
      good sync.
- [ ] `playbackRate` settles rather than oscillating. Verify by *logging drift
      every 500 ms across the full run and plotting it*, not by watching the
      HUD. Distinguish three cases: a ramp (clock rate mismatch — check the
      regression slope), a sawtooth (limit cycle — check whether the corrector
      was actually firing; if `rate === 1` throughout, it is a measurement
      artifact, not feedback), and bounded noise about zero (healthy).
- [ ] Recovery from an injected 150 ms disturbance is under ~4 s, with no
      overshoot past zero and no re-entry into correction after locking
- [ ] Hard-resync count is 0 on an undisturbed run; an injected 600 ms
      disturbance triggers exactly one, logs it, and re-locks
- [ ] Live source count is only ever 0 or 4 — including through ten rapid
      seeks, and through a pause issued inside the 150 ms scheduling lead
- [ ] Peak memory under 100 MB (four 50 s stereo buffers ≈ 76 MB float32)
- [ ] Master limiter present; no path bypasses it

---

## §3 Stage 2 — Custom element in the Astro site

Only start once §2.7 is fully green. This stage is a port, not a rewrite.

### 3.1 Files

```
src/components/stem-player/
  StemPlayer.astro          # wrapper, client:visible
  stem-player.ts            # custom element — engine ported from lab
  picture-source.ts         # PictureSource + CanvasPicture
  stem-player.css           # TOKEN-GUARD values only
src/data/stems.json         # { slug, picture, stems[], offsetMs }
src/pages/new/lab/stems.astro
public/audio/stems/*.m4a    # copied from lab/assets/stems
```

Stems in `public/` are served same-origin by Astro. **No CORS configuration
is needed at this stage** — that only arrives with R2 in §5.

Four AAC files at ~800 KB each is ~3.2 MB in the repo. Fine to commit for a
prototype; revisit if it grows.

### 3.2 Context singleton with HMR disposal

```ts
export function getCtx(): AudioContext {
  const w = window as any;
  w.__stemCtx ??= new AudioContext();
  return w.__stemCtx;
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => (window as any).__stemCtx?.suspend());
}
```

Without this, every hot reload leaves a live context playing underneath the
new one.

### 3.3 Integration requirements

- Route is `noindex`, unlinked from nav, absent from sitemap.
- `ctx.resume()` wired to the existing "this site is meant to be heard" gate.
  That click is the required user gesture — do not add a second one.
- Each toggle is a real `<button>` with `aria-pressed`, keyboard reachable,
  visible focus ring.
- `prefers-reduced-motion` disables level-meter animation; toggles still work.
- Fallback: if `AudioContext` is unavailable or decode fails, hide the mixer
  and play a single summed file. The page must never show a dead control
  surface.
- Interface copy names what the listener controls — "Pad", "Pulse",
  "Ambience", "Melody". Never "Track 1" or "Stem A". Label placeholder audio
  as placeholder audio, visibly.

### 3.4 Stage 2 acceptance

- [ ] All Stage 1 criteria still pass inside the Astro build
- [ ] Ten consecutive hot reloads produce no doubled audio
- [ ] Peak memory under 120 MB on a real mid-range Android, page fully loaded
- [ ] Keyboard-only operation verified end to end
- [ ] Fallback verified by disabling `AudioContext` in devtools
- [ ] TOKEN-GUARD check clean

---

## §4 Stage 3 — Branch preview

Cloudflare Pages, **fixed branch name** `stem-player` so the alias is
deterministic (`stem-player.<project>.pages.dev`) rather than a per-commit
hash. Deterministic matters: it becomes the single origin added to the R2
CORS allowlist in §5, and the single stable URL sent to the client. Random
preview subdomains are why people give up and set `*`.

Separately, and regardless of this CR: put Cloudflare Access in front of
`/new`. It is free at this team size and stops the work-in-progress site
being indexed or stumbled into.

---

## §5 Deferred — Cloudflare provisioning

Execute only when a Stream subscription exists and real assets have arrived.

1. Stream subscription; R2 bucket `kalo-stems`.
2. Scoped API token: `Stream:Edit` + `Workers R2 Storage:Edit`.
   Store as `CF_API_TOKEN` in `.env.local`.
   **Add `.env.local` to `.gitignore` before the token exists on disk.**
3. R2 CORS — needs range support for `decodeAudioData`:
   ```json
   [{
     "AllowedOrigins": [
       "https://kalodimitrov.com",
       "https://stem-player.<project>.pages.dev",
       "http://localhost:4321"
     ],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["range"],
     "ExposeHeaders": ["content-length", "content-range", "accept-ranges"],
     "MaxAgeSeconds": 3600
   }]
   ```
   Connect a custom domain (`stems.kalodimitrov.com`); the `r2.dev` URL is
   rate-limited and not for production.
4. Stream upload:
   ```bash
   curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
     -d '{"url":"https://.../reel-01-master.mp4","meta":{"name":"reel-01"}}' \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/copy"
   ```
   Record the `uid`, then restrict playback:
   ```bash
   curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
     -d '{"allowedOrigins":["kalodimitrov.com","stem-player.<project>.pages.dev"]}' \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/$VIDEO_UID"
   ```
5. Implement `VideoPicture` (hls.js) behind the existing `PictureSource`
   interface. Keep the video muted — no `createMediaElementSource`, so no
   CORS tainting and iOS native-HLS fallback costs nothing.

---

## §6 Deferred — Client asset spec

Send verbatim. Getting the export wrong costs a full round trip.

**Per piece (2 total):** original picture master (not the YouTube copy);
3–5 stereo stems from the session; the final stereo print master for
verification.

**Export rules:**

1. Bounce **session start to session end**, identical length on every stem.
   Not from the first note. Head silence is correct and necessary.
2. **No normalisation, limiting, or dithering on individual stems.** Faders at
   mix position. The sum must null against the print master.
3. 48 kHz / 24-bit WAV. No MP3 intermediates.
4. Mark the intended 45–60 s excerpt by timecode. We trim; he doesn't.

**Null test before encoding:**

```bash
ffmpeg -i music.wav -i dialogue.wav -i foley.wav -i ambience.wav -i master.wav \
  -filter_complex "[0][1][2][3]amix=inputs=4:normalize=0[sum];\
[sum][4]amix=inputs=2:weights=1 -1[out]" \
  -map "[out]" -f null - 2>&1 | grep max_volume
```

Expect ≈ −80 dB or lower. Above about −40 dB means stems were individually
processed and the all-faders-up state will not match his master.

**AAC encoder delay:** priming samples are identical across stems encoded with
the same settings, so stems stay mutually aligned. It does add a small constant
A/V offset (~20–40 ms) — measure it once against the sync transient and bake it
into `offsetMs`.

**Rights:** confirm in writing that both pieces are cleared for portfolio use
*and* that exposing isolated stems is acceptable. Some post houses treat
separated dialogue as deliverable material rather than promo.

---

## §7 Claude Code session prompts

**Session 1 — Stage 1**

> Read CR-002-stem-player.md and TOKEN-GUARD.md. Create branch `stem-player`.
> Implement §2 only: `lab/make-stems.sh`, generate the four synthetic stems,
> and build `lab/stem-lab.html` as a single self-contained file with the
> engine, canvas picture stand-in, and debug HUD. Follow every rule in §0 —
> in particular the master gain ceiling and limiter. Do not touch `src/`.
> When done, run the generator, report the four durations, and give me the
> serve command. Stop there; I will listen before we continue.

**Session 2 — Stage 2**

> Stage 1 acceptance in §2.7 is green. Port the engine into the Astro site per
> §3. Extract `PictureSource` cleanly so a `VideoPicture` implementation can be
> added later without touching engine code. Route at `/new/lab/stems`,
> noindex, unlinked. Use TOKEN-GUARD values for all CSS. Do not modify any
> existing route or component.

**Session 3 — Stage 3**

> Configure the Cloudflare Pages preview for branch `stem-player` with a fixed
> alias per §4. Report the resulting URL.

---

## §8 Linear — team Denkisa Dev

1. `CR-002-1` Stage 1 — synthetic stem generator + standalone lab
2. `CR-002-2` Stage 1 — sync, drift, and memory QA pass
3. `CR-002-3` Stage 2 — port to custom element, `/new/lab/stems`
4. `CR-002-4` Stage 2 — a11y, fallback, mobile memory verification
5. `CR-002-5` Stage 3 — fixed-alias branch preview
6. `CR-002-6` Cloudflare Access in front of `/new` — independent of this CR
7. `CR-002-7` Request stems + masters from client (§6 spec) — **blocking for real assets**
8. `CR-002-8` Cloudflare Stream + R2 provisioning (§5) — blocked on 7
