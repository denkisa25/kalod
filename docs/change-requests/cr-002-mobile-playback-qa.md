# CR-002 — Mobile playback QA findings
kalodimitrov.com · first real-device pass · iPhone 13 Pro Max, Chrome (iOS) · 2026-07-14

"Chrome" on iOS is Safari/WebKit under the hood (Apple requires all iOS
browsers to use WebKit) — every finding below is really a WebKit finding,
not Chrome-specific, and will reproduce identically in Safari, Chrome,
Firefox, or any other iOS browser.

---

## Finding 1 — Home feed background loops never start playing; scrolling to
a cue shows YouTube's own red play button instead of the ambient video
**Status: known limitation, not fixed this session — see "the real fix" below.**

**What's happening:** `getBackgroundEmbed()` (`src/lib/video-source.ts`)
requests `autoplay=1&mute=1&playsinline=1` on the YouTube iframe, which
satisfies the standard "muted autoplay is allowed" browser rule — and does
work reliably on desktop. iOS/WebKit is specifically unreliable about
honoring autoplay for **YouTube iframe embeds** even when muted, especially
when the iframe is attached programmatically (our IntersectionObserver
firing on scroll) rather than as the direct, synchronous result of a tap.
YouTube's own player then falls back to showing its paused state with a
play-button overlay — exactly what was observed.

**Why this isn't a quick code fix:** this is a long-documented YouTube/iOS
interaction, not a bug in this codebase. Native `<video>` elements are far
more reliably auto-playable-when-muted on iOS than a third-party iframe's
internal player.

**The real fix is already planned:** `docs/claude-code-kickoff.md` and
`CLAUDE.md` already scope YouTube as *temporary, concept-parity only* — the
`VideoSource` abstraction (`src/lib/video-source.ts`) exists specifically so
swapping in Vimeo Pro progressive MP4s (real `<video>` elements) requires no
layout/call-site changes. That swap is the actual structural fix for this
finding, not a YouTube-side workaround.

## Finding 2 — Videos are slow to appear on mobile
**Status: partially mitigated this session; full fix tied to Finding 1.**

Contributing factors: (a) the same YouTube-iframe boot overhead discussed
in the video-performance work done earlier this session (preconnect/preload
hints now added, `src/layouts/BaseLayout.astro`) — iOS/WebKit's support for
`<link rel=preconnect>` is less aggressive than desktop Chromium, so the
benefit is smaller here than on desktop; (b) mobile network latency; (c)
because autoplay fails (Finding 1), the poster stays on screen with no
visible progress, which reads as "slow" even where the iframe is loading
in the background. Finding 1's fix (native `<video>` via Vimeo) addresses
the root cause; nothing further to do here until then.

## Finding 3 — Only way to start the detail-overlay ("watch full video")
player was tapping the small "play" text
**Status: fixed this session.**

`getPlayerEmbed()` requests `autoplay=1` **without** `mute=1` (CR-8 — full
player, autoplay *with sound*). Unmuted autoplay is blocked by essentially
every modern browser, mobile and desktop, as a deliberate anti-annoyance
policy — this is expected, intentional browser behavior, not something any
amount of JS can reliably override on a first visit. The small `#cPlay`
"play" text was, until now, the only way to give the browser the direct tap
it needs to allow playback.

**Fix:** clicking/tapping anywhere on the video area now toggles play/pause
— not just the small text button (`src/components/DetailOverlay.astro`'s
new `.clickzone` overlay, wired in `src/scripts/player-controls.ts`). Applies
identically on desktop and mobile (a single `click` handler, no
touch-specific code needed). This also gives the browser a bigger, more
discoverable, in-the-moment tap to work with, which is the best available
lever for getting autoplay-with-sound to actually start.

## Finding 4 — Clarification, not a bug: desktop does not "autoplay with
sound" either
Raised while discussing Finding 1/3: desktop's current behavior (CR-4, by
design) is **muted-only** autoplay on the home feed; sound requires one
explicit click on the volume/sound toggle, after which the preference
persists in `sessionStorage` across cues and filtering for the rest of that
session — which can *feel* like "it just autoplays with sound" once already
enabled, but the first unmute always requires a real click. There is no
configuration, on any platform, that achieves true zero-interaction
autoplay-with-sound; browsers block it everywhere by design.

---

## Open, for a client-facing conversation
- Priority/timeline for the Vimeo Pro migration (Finding 1/2's actual fix;
  see "Still open with the client" item 2 in `docs/claude-code-kickoff.md`).
- Whether it's worth a stopgap for YouTube specifically in the meantime
  (e.g., a visible "tap to play" affordance on background cues instead of
  YouTube's own small red button) — not attempted this session; flagging as
  a decision rather than assuming it's wanted, since the honest fix is the
  provider swap already on the roadmap.
