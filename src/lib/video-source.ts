/** VideoSource abstraction (spec §11 / kickoff workflow note).
 *  YouTube is the working provider for dev; Vimeo is stubbed here so
 *  progressive MP4 sources can swap in at launch without touching
 *  any layout or call site — every consumer only ever talks to this
 *  interface, never to a provider URL scheme directly.
 *
 *  Cloudflare Stream (docs/video-migration-guide.md) is the first provider
 *  that isn't an iframe embed — it plays through a real <video> element
 *  (the actual fix for the iOS background-loop autoplay unreliability
 *  documented in cr-002-mobile-playback-qa.md). getBackgroundEmbed/
 *  getPlayerEmbed return an EmbedSpec discriminated union instead of a bare
 *  URL string so video-layer.ts knows which kind of element to create. */

export type VideoProviderName = 'youtube' | 'vimeo' | 'cloudflare';

export interface VideoRef {
  provider: VideoProviderName | null;
  id: string | null;
  /** Cloudflare Stream only — direct URLs from cloudflare-stream-map.json
   *  (via scripts/upload-to-cloudflare-stream.mjs), not something parsed
   *  from a single embeddable link the way YouTube/Vimeo ids are. */
  cloudflare?: { mp4Url: string; thumbnailUrl: string };
}

export type EmbedSpec =
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string };

export interface VideoSource {
  /** muted, looping, chromeless — feed background loops */
  getBackgroundEmbed(ref: VideoRef): EmbedSpec | null;
  /** full player, autoplay with sound — detail overlay */
  getPlayerEmbed(ref: VideoRef): EmbedSpec | null;
  /** CR-7 gallery tile hover — two distinct auto-generated poster frames to
   *  cross-fade between, a zero-video-cost stand-in for a preview loop. */
  getPreviewFrames(ref: VideoRef): [string, string] | null;
}

/** project.video from phase0/extraction/projects.json is a full oEmbed
 *  embed URL (youtube-nocookie or player.vimeo.com) — pull provider + id.
 *  Cloudflare-migrated projects don't go through this at all; projects.ts
 *  overrides the videoRef for any slug present in cloudflare-stream-map.json. */
export function parseVideoUrl(url: string | null): VideoRef {
  if (!url) return { provider: null, id: null };
  const yt = url.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
  if (yt) return { provider: 'youtube', id: yt[1] };
  const vimeo = url.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (vimeo) return { provider: 'vimeo', id: vimeo[1] };
  return { provider: null, id: null };
}

class YouTubeSource implements VideoSource {
  getBackgroundEmbed(ref: VideoRef): EmbedSpec | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({
      autoplay: '1', mute: '1', loop: '1', playlist: ref.id,
      controls: '0', playsinline: '1', modestbranding: '1',
      rel: '0', iv_load_policy: '3', disablekb: '1',
      // CR-4: the feed's volume control drives these through the IFrame
      // Player API (unMute/setVolume/mute), which requires this flag.
      enablejsapi: '1',
    });
    return { kind: 'iframe', src: `https://www.youtube.com/embed/${ref.id}?${p}` };
  }
  getPlayerEmbed(ref: VideoRef): EmbedSpec | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({
      autoplay: '1', playsinline: '1', modestbranding: '1',
      rel: '0', iv_load_policy: '3',
      // CR-8: no native YouTube control bar — controls=0, driven entirely
      // through the IFrame Player API (player-controls.ts)
      controls: '0', enablejsapi: '1',
    });
    return { kind: 'iframe', src: `https://www.youtube.com/embed/${ref.id}?${p}` };
  }
  getPreviewFrames(ref: VideoRef): [string, string] | null {
    if (!ref.id) return null;
    // "2.jpg" is YouTube's numbered-frame thumbnail at 120x90 — stretched
    // across a gallery tile via object-fit: cover, that upscale reads as
    // blurry. "hq2.jpg" is the same frame at 480x360 (matches hqdefault.jpg).
    return [`https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg`, `https://i.ytimg.com/vi/${ref.id}/hq2.jpg`];
  }
}

/** Stub — swap for Vimeo Pro progressive MP4 sources at launch (spec §11).
 *  The iframe embed shape below already works against free-tier Vimeo
 *  today, so existing vimeo links in projects.json render correctly;
 *  "stub" means: not yet validated against the client's Pro account. */
class VimeoSource implements VideoSource {
  getBackgroundEmbed(ref: VideoRef): EmbedSpec | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({ background: '1', muted: '1', autoplay: '1', loop: '1' });
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${ref.id}?${p}` };
  }
  getPlayerEmbed(ref: VideoRef): EmbedSpec | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({ autoplay: '1' });
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${ref.id}?${p}` };
  }
  getPreviewFrames(): [string, string] | null {
    return null; // no free-tier thumbnail API equivalent — falls back to the static poster
  }
}

/** Real <video> playback, not an iframe — the actual fix for iOS's
 *  unreliable muted-autoplay-on-scroll for cross-origin iframes
 *  (cr-002-mobile-playback-qa.md). video-layer.ts creates a <video>
 *  element for a 'video'-kind EmbedSpec and drives it through
 *  native-video-player.ts's adapter instead of the YouTube IFrame API. */
class CloudflareStreamSource implements VideoSource {
  getBackgroundEmbed(ref: VideoRef): EmbedSpec | null {
    if (!ref.cloudflare) return null;
    return { kind: 'video', src: ref.cloudflare.mp4Url };
  }
  getPlayerEmbed(ref: VideoRef): EmbedSpec | null {
    if (!ref.cloudflare) return null;
    return { kind: 'video', src: ref.cloudflare.mp4Url };
  }
  getPreviewFrames(ref: VideoRef): [string, string] | null {
    if (!ref.cloudflare) return null;
    // Cloudflare's thumbnail endpoint takes a time= offset — two different
    // offsets stand in for YouTube's two numbered-frame thumbnails.
    return [`${ref.cloudflare.thumbnailUrl}?time=1s`, `${ref.cloudflare.thumbnailUrl}?time=4s`];
  }
}

const sources: Record<VideoProviderName, VideoSource> = {
  youtube: new YouTubeSource(),
  vimeo: new VimeoSource(),
  cloudflare: new CloudflareStreamSource(),
};

export function getVideoSource(ref: VideoRef): VideoSource | null {
  if (!ref.provider) return null;
  return sources[ref.provider];
}
