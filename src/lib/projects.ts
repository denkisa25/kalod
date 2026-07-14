import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import rawProjects from '../../phase0/extraction/projects.json';
import creditsBySlug from '../data/credits.json';
import cloudflareStreamMap from '../data/cloudflare-stream-map.json';
import { parseVideoUrl, type VideoRef } from './video-source';
import { ROLE_LABELS, type Role } from './format';

export type { Role };
export { ROLE_LABELS };

export interface Credit {
  role: string;
  name: string;
}

export interface Project {
  title: string;
  slug: string;
  roles: Role[];
  video: string | null;
  videoRef: VideoRef;
  poster: string;
  client: string;
  excerpt: string;
  featured: boolean;
  date: string;
  credits: Credit[];
}

const postersDir = join(process.cwd(), 'public/posters');
const posterFiles = readdirSync(postersDir);

function resolvePoster(slug: string): string {
  const file = posterFiles.find((f) => f.replace(/\.(jpg|jpeg|png|webp)$/i, '') === slug);
  if (!file) throw new Error(`No poster found for project slug "${slug}"`);
  return `/posters/${file}`;
}

/** Cloudflare Stream override (docs/video-migration-guide.md) — a slug
 *  present in cloudflare-stream-map.json (populated by
 *  scripts/upload-to-cloudflare-stream.mjs) takes over from whatever
 *  provider phase0/extraction/projects.json's original video URL points
 *  at, non-destructively: the source data never needs editing, and a slug
 *  reverts to its original provider automatically if ever removed from the
 *  map. */
function resolveVideoRef(slug: string, video: string | null): VideoRef {
  const migrated = (cloudflareStreamMap as Record<string, { uid: string; mp4Url: string; thumbnailUrl: string }>)[slug];
  if (migrated) {
    return { provider: 'cloudflare', id: migrated.uid, cloudflare: migrated };
  }
  return parseVideoUrl(video);
}

/** "Viktoria /Trailer/" -> "viktoria /trailer/" (lowercase brand voice, spec §4) */
function decodeEntities(s: string): string {
  return s
    .replace(/&#8211;/g, '–')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8217;/g, '’')
    .replace(/&#8230;/g, '…')
    .replace(/&#038;/g, '&');
}

/** old-site titles sometimes carry a trailing "TVC" / client name — kept as-is,
 *  the client field is derived separately where the source data has one.
 *  Keyed by slug (not title, despite how this used to read). */
function deriveClient(slug: string): string {
  const known: Record<string, string> = {
    'audi-quattro-hitchhiker': 'audi',
    'pepsi-xmas': 'pepsi',
    'societe-saving': 'societe generale',
    'btv-tv-talent-show': 'btv media group',
    viktoria: 'miramar film',
    'viktoria-trailer-2': 'miramar film',
    'burkinabe-rising': 'iara lee / cultures of resistance',
  };
  return known[slug] ?? '';
}

// computed once per build — getProjects() is called from 3 separate page
// entry points (index, work/index, work/[slug]'s getStaticPaths), and the
// mapping (regex decode, video-URL parsing, an O(n) poster-filename scan
// per project) is pure and identical every time
let projectsCache: Project[] | null = null;

export function getProjects(): Project[] {
  if (!projectsCache) {
    projectsCache = (rawProjects as Array<Record<string, unknown>>).map((p) => {
      const slug = p.slug as string;
      const video = (p.video as string) || null;
      return {
        title: decodeEntities(p.title as string).toLowerCase(),
        slug,
        roles: p.roles as Role[],
        video,
        videoRef: resolveVideoRef(slug, video),
        poster: resolvePoster(slug),
        client: deriveClient(slug),
        excerpt: decodeEntities((p.excerpt as string) || ''),
        featured: Boolean(p.featured),
        date: p.date as string,
        credits: (creditsBySlug as Record<string, Credit[]>)[slug] ?? [],
      };
    });
  }
  // a shallow copy, not the cache itself — src/pages/work/index.astro calls
  // .sort() directly on this return value, which mutates in place; handing
  // back the live cache reference would let that sort corrupt every other
  // caller's project order (getStaticPaths()'s prev/next included) for the
  // rest of the build
  return [...projectsCache];
}

export function getFeaturedProjects(limit = 10): Project[] {
  return getProjects()
    .filter((p) => p.featured)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}
