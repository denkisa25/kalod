/** Adapts a native HTMLVideoElement to the same YTPlayer-shaped interface
 *  (src/lib/youtube-api.ts) that player-controls.ts and video-layer.ts's
 *  crossfade/audio logic already drive — so adding Cloudflare Stream's real
 *  <video> playback (src/lib/video-source.ts) needed no changes to that
 *  control logic at all, just a different thing to hand it. Native video
 *  state maps closely enough onto YouTube's (paused/playing/volume 0-100
 *  vs 0-1) that this is a thin translation layer, not a reimplementation. */
import type { YTPlayer, NativeCapabilities } from './youtube-api';

// Matches YouTube's actual runtime PlayerState values (not just the type
// declarations in youtube-api.ts) — player-controls.ts's YT_PLAYING = 1
// check needs this adapter to agree on the same numbers.
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

/** CR-003 — the capabilities that only exist because this is a real media
 *  element. Kept in one object so player-controls.ts can feature-detect once
 *  (`player.native`) instead of probing method by method. */
function nativeCapabilities(video: HTMLVideoElement): NativeCapabilities {
  return {
    bufferedRatio() {
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0 || video.buffered.length === 0) return 0;
      // Report the range the playhead is actually inside — with multiple
      // ranges (after seeking around) the last one can be far ahead of the
      // playhead and would draw a buffer bar that is simply untrue.
      for (let i = 0; i < video.buffered.length; i += 1) {
        if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
          return Math.min(1, video.buffered.end(i) / d);
        }
      }
      return 0;
    },
    setRate(rate) {
      video.playbackRate = rate;
    },
    getRate() {
      return video.playbackRate;
    },
    supportsPiP() {
      return document.pictureInPictureEnabled === true && !video.disablePictureInPicture;
    },
    async togglePiP() {
      try {
        if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch {
        // user gesture requirements and per-browser policy — not an error
        // worth surfacing over the video
      }
    },
    on(events, cb) {
      events.forEach((e) => video.addEventListener(e, cb));
      return () => events.forEach((e) => video.removeEventListener(e, cb));
    },
  };
}

export function adaptVideoElement(video: HTMLVideoElement): YTPlayer {
  return {
    native: nativeCapabilities(video),
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
