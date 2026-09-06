/** Minimal ambient surface for the YouTube IFrame Player API — driven
 *  through real YT.Player instances (not raw postMessage) for CR-4's feed
 *  volume ramps and CR-8's custom transport controls. No @types/youtube
 *  dependency; this is the entire subset the codebase actually calls. */
/** CR-003 — capabilities a real <video> element has and a cross-origin
 *  YouTube iframe does not. Attached by native-video-player.ts and absent on
 *  YouTube players, so every consumer must feature-detect (`player.native`)
 *  rather than assume. This is what the Cloudflare Stream migration bought:
 *  buffered ranges, real media events, playback rate and Picture-in-Picture
 *  are simply not reachable through the IFrame API. */
export interface NativeCapabilities {
  /** 0..1 of duration that is buffered ahead of the playhead. */
  bufferedRatio(): number;
  setRate(rate: number): void;
  getRate(): number;
  supportsPiP(): boolean;
  togglePiP(): Promise<void>;
  /** Subscribes to media events; returns an unsubscribe function so a rebind
   *  cannot leave the previous cue's listeners firing into the new one. */
  on(events: readonly string[], cb: () => void): () => void;
}

export interface YTPlayer {
  /** Present only on the native <video> adapter — see NativeCapabilities. */
  native?: NativeCapabilities;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { target: YTPlayer; data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts?: YTPlayerOptions) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number; UNSTARTED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once, resolving with the same
 *  window.YT namespace on every call (safe to call from multiple cues). */
export function loadYouTubeAPI(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}
