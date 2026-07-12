/** VideoSource abstraction (spec §11 / kickoff workflow note).
 *  YouTube is the working provider for dev; Vimeo is stubbed here so
 *  progressive MP4 sources can swap in at launch without touching
 *  any layout or call site — every consumer only ever talks to this
 *  interface, never to a provider URL scheme directly. */

export type VideoProviderName = 'youtube' | 'vimeo';

export interface VideoRef {
  provider: VideoProviderName | null;
  id: string | null;
}

export interface VideoSource {
  /** muted, looping, chromeless — feed background loops */
  getBackgroundEmbed(ref: VideoRef): string | null;
  /** full player, autoplay with sound — detail overlay */
  getPlayerEmbed(ref: VideoRef): string | null;
  /** CR-7 gallery tile hover — two distinct auto-generated poster frames to
   *  cross-fade between, a zero-video-cost stand-in for a preview loop. */
  getPreviewFrames(ref: VideoRef): [string, string] | null;
}

/** project.video from phase0/extraction/projects.json is a full oEmbed
 *  embed URL (youtube-nocookie or player.vimeo.com) — pull provider + id. */
export function parseVideoUrl(url: string | null): VideoRef {
  if (!url) return { provider: null, id: null };
  const yt = url.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
  if (yt) return { provider: 'youtube', id: yt[1] };
  const vimeo = url.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (vimeo) return { provider: 'vimeo', id: vimeo[1] };
  return { provider: null, id: null };
}

class YouTubeSource implements VideoSource {
  getBackgroundEmbed(ref: VideoRef): string | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({
      autoplay: '1', mute: '1', loop: '1', playlist: ref.id,
      controls: '0', playsinline: '1', modestbranding: '1',
      rel: '0', iv_load_policy: '3', disablekb: '1',
      // CR-4: the feed's volume control drives these through the IFrame
      // Player API (unMute/setVolume/mute), which requires this flag.
      enablejsapi: '1',
    });
    return `https://www.youtube.com/embed/${ref.id}?${p}`;
  }
  getPlayerEmbed(ref: VideoRef): string | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({
      autoplay: '1', playsinline: '1', modestbranding: '1',
      rel: '0', iv_load_policy: '3',
    });
    return `https://www.youtube.com/embed/${ref.id}?${p}`;
  }
  getPreviewFrames(ref: VideoRef): [string, string] | null {
    if (!ref.id) return null;
    return [`https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg`, `https://i.ytimg.com/vi/${ref.id}/2.jpg`];
  }
}

/** Stub — swap for Vimeo Pro progressive MP4 sources at launch (spec §11).
 *  The iframe embed shape below already works against free-tier Vimeo
 *  today, so existing vimeo links in projects.json render correctly;
 *  "stub" means: not yet validated against the client's Pro account. */
class VimeoSource implements VideoSource {
  getBackgroundEmbed(ref: VideoRef): string | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({ background: '1', muted: '1', autoplay: '1', loop: '1' });
    return `https://player.vimeo.com/video/${ref.id}?${p}`;
  }
  getPlayerEmbed(ref: VideoRef): string | null {
    if (!ref.id) return null;
    const p = new URLSearchParams({ autoplay: '1' });
    return `https://player.vimeo.com/video/${ref.id}?${p}`;
  }
  getPreviewFrames(): [string, string] | null {
    return null; // no free-tier thumbnail API equivalent — falls back to the static poster
  }
}

const sources: Record<VideoProviderName, VideoSource> = {
  youtube: new YouTubeSource(),
  vimeo: new VimeoSource(),
};

export function getVideoSource(ref: VideoRef): VideoSource | null {
  if (!ref.provider) return null;
  return sources[ref.provider];
}
