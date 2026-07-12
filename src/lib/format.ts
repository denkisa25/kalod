/** Shared, client-safe formatting helpers — no Node imports, so this can be
 *  imported from both Astro frontmatter (server) and client-side scripts
 *  (browser bundle), unlike lib/projects.ts which pulls in node:fs.
 *  Previously hand-copied into 4+ files independently; consolidated here
 *  after a code-review pass flagged the drift risk. */

export type Role = 'music' | 'mix' | 'sound-design';

export const ROLE_LABELS: Record<Role, string> = {
  music: 'music',
  mix: 'mix',
  'sound-design': 'sound design',
};

export const roleLine = (roles: Role[]): string => roles.map((r) => ROLE_LABELS[r]).join(' · ');

export const pad = (n: number): string => String(n).padStart(2, '0');

/** Intersection ratio that decides "this cue is the active one" — shared by
 *  the rail's active-state observer (feed-interactions.ts) and the
 *  background-video-loop observer (video-layer.ts). They must agree: if
 *  tuned independently, the rail could highlight a different cue than the
 *  one actually streaming video. */
export const CUE_ACTIVE_THRESHOLD = 0.55;
