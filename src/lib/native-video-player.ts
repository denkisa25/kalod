/** Adapts a native HTMLVideoElement to the same YTPlayer-shaped interface
 *  (src/lib/youtube-api.ts) that player-controls.ts and video-layer.ts's
 *  crossfade/audio logic already drive — so adding Cloudflare Stream's real
 *  <video> playback (src/lib/video-source.ts) needed no changes to that
 *  control logic at all, just a different thing to hand it. Native video
 *  state maps closely enough onto YouTube's (paused/playing/volume 0-100
 *  vs 0-1) that this is a thin translation layer, not a reimplementation. */
import type { YTPlayer } from './youtube-api';

// Matches YouTube's actual runtime PlayerState values (not just the type
// declarations in youtube-api.ts) — player-controls.ts's YT_PLAYING = 1
// check needs this adapter to agree on the same numbers.
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

export function adaptVideoElement(video: HTMLVideoElement): YTPlayer {
  return {
    mute() {
      video.muted = true;
    },
    unMute() {
      video.muted = false;
    },
    isMuted() {
      return video.muted;
    },
    setVolume(volume: number) {
      video.volume = Math.max(0, Math.min(100, volume)) / 100;
    },
    getVolume() {
      return Math.round(video.volume * 100);
    },
    getPlayerState() {
      if (video.ended) return ENDED;
      if (video.paused) return PAUSED;
      if (video.readyState < 3) return BUFFERING; // HAVE_FUTURE_DATA
      return PLAYING;
    },
    playVideo() {
      // play() returns a rejecting promise if autoplay is blocked — that's
      // the browser's own policy (cr-002-mobile-playback-qa.md), not an
      // error this adapter should surface/throw for.
      video.play().catch(() => {});
    },
    pauseVideo() {
      video.pause();
    },
    seekTo(seconds: number) {
      video.currentTime = seconds;
    },
    getCurrentTime() {
      return video.currentTime;
    },
    getDuration() {
      return Number.isFinite(video.duration) ? video.duration : 0;
    },
    destroy() {
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}

/** Fires once the element has enough data to report a real duration/seek
 *  target — the closest native equivalent to the IFrame API's onReady. */
export function onVideoReady(video: HTMLVideoElement, cb: () => void): void {
  if (video.readyState >= 1) {
    cb(); // HAVE_METADATA already reached (e.g. cached video)
    return;
  }
  video.addEventListener('loadedmetadata', () => cb(), { once: true });
}
