/** Cue choreography, ported verbatim from docs/reference/site-concept-v3.html.
 *  thumps 600/1300 · riser 2000→4600 · hits 2600/3300/3900
 *  drop 4600 (flash, rings, wordmark forms) · outro 6200 (bg → transparent,
 *  cue 01 emerges beneath, particles drift apart over it) · end 7600.
 *  These marks are hand-tuned to the placeholder buildCue() synth — once
 *  the client's real cue lands they'll need retiming to its actual hits. */
export interface Timeline {
  thumps: [number, number];
  riser: [number, number];
  hits: [number, number, number];
  drop: number;
  outro: number;
  end: number;
}

export const T: Timeline = {
  thumps: [600, 1300],
  riser: [2000, 4600],
  hits: [2600, 3300, 3900],
  drop: 4600,
  outro: 6200,
  end: 7600,
};

/** Synthetic amplitude envelope — the visual's "energy" signal when no
 *  live AnalyserNode data (or decoded-file envelope) drives it. */
export function env(t: number): number {
  let e =
    t < T.riser[0]
      ? 0.22
      : t < T.drop
        ? 0.22 + 0.78 * Math.pow((t - T.riser[0]) / (T.drop - T.riser[0]), 1.6)
        : Math.exp(-(t - T.drop) / 700);
  for (const h of [...T.thumps, ...T.hits, T.drop]) {
    if (t >= h) e += (h === T.drop ? 1 : 0.55) * Math.exp(-(t - h) / 170);
  }
  return Math.min(e, 1.6);
}

/** Cheap pseudo-noise used for the idle line and quiet-mode waveform shape
 *  when no real waveform data (live FFT or decoded buffer) is available. */
export function pseudo(x: number, t: number): number {
  return (
    Math.sin(x * 0.021 + t * 0.0061) * 0.5 +
    Math.sin(x * 0.047 - t * 0.0043) * 0.3 +
    Math.sin(x * 0.009 + t * 0.0021) * 0.2
  );
}
