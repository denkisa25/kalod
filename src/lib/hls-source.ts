/** CR-003 item 8 — adaptive bitrate.
 *
 *  Cloudflare Stream serves both a progressive MP4 and an HLS manifest for
 *  every video. The MP4 is one fixed rendition: measured on this project's own
 *  cues, burkinabe-rising is 61 MB and viktoria-trailer-2 is 24 MB, and a phone
 *  on a weak connection was downloading exactly those bytes. HLS lets the
 *  player pick a rendition that fits the connection.
 *
 *  WHY THIS IS SPLIT OUT AND LAZY. Safari and iOS play HLS natively in a
 *  <video>, so they get adaptive bitrate for zero JavaScript — which matters,
 *  because iOS is a large share of the mobile traffic this is meant to help.
 *  Everywhere else needs hls.js, and hls.js is genuinely large: the light
 *  build is ~116 KB gzip, not the ~35 KB commonly assumed. That is only
 *  defensible because it is (a) dynamically imported, so it never touches the
 *  initial bundle or the <80 KB budget in spec §11, and (b) trading ~116 KB
 *  against tens of megabytes of video. It is imported only when a video
 *  actually attaches on a browser that needs it.
 *
 *  The MP4 always remains the fallback: no hlsSrc, no hls.js support, or a
 *  failed import all land on it rather than on a dead player. */

export interface VideoSourceSpec {
  /** progressive MP4 — always present, always the fallback */
  src: string;
  /** HLS manifest — preferred when playable */
  hlsSrc?: string;
}

/** Safari/iOS report native HLS here; Chrome/Firefox/Edge return ''. */
function hasNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Points `video` at the best source it can play and returns a teardown
 * function. Teardown is SYNCHRONOUS and safe to call before the async import
 * resolves — a late-arriving hls.js will find the operation cancelled and
 * attach nothing, which matters because video-layer.ts tears cues down on
 * scroll far faster than a module can load over a slow connection. Leaking an
 * Hls instance means it keeps fetching segments for a cue that is off screen.
 */
export function attachVideoSource(video: HTMLVideoElement, spec: VideoSourceSpec): () => void {
  let cancelled = false;
  let destroy: (() => void) | null = null;

  const useMp4 = () => {
    if (!cancelled) video.src = spec.src;
  };

  if (!spec.hlsSrc) {
    useMp4();
  } else if (hasNativeHls(video)) {
    // Zero-JS path. Safari and iOS handle the manifest and the rendition
    // switching themselves.
    video.src = spec.hlsSrc;
  } else {
    import('hls.js/light')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          useMp4();
          return;
        }
        const hls = new Hls({
          // The feed attaches and tears down cues on scroll, so a long buffer
          // is wasted bandwidth for a cue the visitor has already passed.
          maxBufferLength: 20,
          // Start conservatively and let ABR climb; the alternative is opening
          // on the highest rendition, which is the very cost being avoided.
          startLevel: -1,
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          // Only fatal errors are worth acting on — hls.js recovers from most
          // network and media errors on its own.
          if (!data.fatal) return;
          hls.destroy();
          destroy = null;
          useMp4();
        });
        hls.loadSource(spec.hlsSrc!);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      })
      .catch(() => {
        // module failed to load (offline, blocked, CSP) — still play something
        useMp4();
      });
  }

  return () => {
    cancelled = true;
    destroy?.();
    destroy = null;
  };
}
