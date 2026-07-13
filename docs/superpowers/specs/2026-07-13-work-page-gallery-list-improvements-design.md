# Work page: gallery tile legibility + list-view inline expand

Date: 2026-07-13
Status: approved, ready for implementation plan

## Context

Follow-up to the CR-7/CR-8 gallery work (list ⇄ gallery view switcher, shared
detail-overlay player). Three issues raised against the current build:

1. Gallery tile title text is too small to read comfortably — noticeably
   smaller than the equivalent title in list view.
2. List view rows navigate to a standalone `/work/[slug]` page on click.
   The client wants full project info available inline, without leaving
   `/work`.
3. The inline-expanded row needs a "watch full video" action that opens the
   same shared overlay player the gallery view already uses — not a second
   player, not a navigation.

## Constraint that shapes the design

`/work/[slug].astro` (the standalone per-project page) **must keep working
and keep being a real, linkable page.** `phase0/extraction/redirect-map.csv`
301-redirects every legacy WordPress project URL straight into
`/work/{slug}/` — spec §13 requires these redirects to ship at launch. The
gallery view's "watch full video" links and the home feed's cue links also
already point at these URLs as their `href` (JS intercepts the click to open
the overlay instead — the href is the progressive-enhancement / no-JS /
crawler fallback). This design does not remove or change `[slug].astro`; it
only changes what happens when a user, with JS enabled, clicks a row in the
`/work` list view.

## 1. Gallery tile title size

`.tile-title` currently uses `clamp(0.95rem, 1.6vw, 1.15rem)`. Change it to
match `.work-row .t` exactly: `clamp(1.1rem, 2.6vw, 1.7rem)`.

No other gallery tile text changes. `.tile-roles` and `.tile-watch` are both
`0.7rem` (11.2px at the default root size), which already matches the
sitewide meta-text convention (`.work-row .r`, `.work-row .n`, cue numbers,
etc.) and clears the CR-11 11px floor — they were never the legibility
problem, only the title was undersized relative to its list-view equivalent.

## 2. List view: inline expand instead of navigation

### Markup

Each `<li>` in `#workList` currently contains a single `<a class="work-row">`
spanning the whole row. Add a sibling panel, not a child — an `<a>` (the
"watch full video" link) cannot be nested inside another `<a>` and stay valid
HTML, so the expand panel lives alongside `.work-row`, not inside it:

```html
<li>
  <a class="work-row" href={`/work/${p.slug}`} data-roles={roles}
     aria-expanded="false" aria-controls={`workDetail-${i}`} data-blip>
    <span class="thumb">...</span>
    <span class="n">{pad(i+1)}</span>
    <span class="t">{p.title}</span>
    <span class="r">{roleLine} · {p.client}</span>
    <span class="chevron" aria-hidden="true">&darr;</span>
  </a>
  <div class="work-detail" id={`workDetail-${i}`} hidden>
    <div class="dcol"><div class="lbl">role</div><b>{roleLine(p.roles)}</b></div>
    {p.client && <div class="dcol"><div class="lbl">client</div><b>{p.client}</b></div>}
    {p.excerpt && <p class="desc">{p.excerpt}</p>}
    <a class="watch" href={`/work/${p.slug}`} data-idx={i} data-blip>watch full video</a>
  </div>
</li>
```

All fields (`roleLine`, `p.client`, `p.excerpt`) are already available in
`work/index.astro`'s `projects` loop — no new data plumbing.

### Interaction (work-page.ts)

- `.work-row` keeps its real `href`. A click listener on it calls
  `e.preventDefault()` and toggles the sibling `.work-detail` panel's
  `hidden` attribute instead of letting the browser navigate.
- Accordion: only one `.work-detail` panel open at a time. Opening a row
  closes whichever panel was previously open (removes its `hidden`
  attribute's absence, flips `aria-expanded` back to `false` on that row).
- `aria-expanded` on `.work-row` tracks open/closed state for screen readers;
  `aria-controls` already points `.work-row` at its panel's id.
- The trailing arrow glyph changes from `→` (implies "go to a page") to a
  chevron that rotates 180° when the row is expanded (implies "this
  expands"), via a `.work-row.expanded .chevron` CSS rule keyed off the
  expanded state.

### The "watch full video" link

Inside `.work-detail`, `<a class="watch" data-idx={i}>` reuses the **existing**
global click-delegation already wired in `video-layer.ts`
(`document.querySelectorAll('.watch[data-idx]')`) — no new player code. This
is the exact same mechanism the gallery tiles and the home feed cues already
use to open `#detail`, the shared overlay player. Clicking it opens the
overlay at that project's cue; the standalone page navigation is still the
`href` fallback for no-JS/crawlers.

### Scope explicitly excluded

- No poster image inside the expanded panel (per your answer — the row's
  existing 140px thumbnail is enough; the panel is text + the watch link).
- No prev/next links inside the panel — that's specific to the standalone
  page's own navigation model, not reproduced here.
- No URL/session-storage sync of which row is expanded — collapses on
  navigation/reload like a normal accordion, consistent with keeping this a
  lightweight enhancement rather than a second source of routing state.

## Verification

- `npm run build` passes; no invalid HTML nesting (`<a>` inside `<a>`).
- Click a row → panel expands with role/client/description + watch link;
  chevron rotates; arrow no longer reads as "go to a page."
- Click a second row → first panel collapses, second expands (accordion).
- Click "watch full video" inside an expanded panel → opens the shared
  overlay at the correct cue (same as gallery view), row underneath stays
  expanded.
- Keyboard: Tab to a row (still a real link) → Enter toggles expand (browser
  fires a click event on Enter for `<a>` elements, which the intercepting
  listener catches) → Tab reaches the watch link inside the now-visible
  panel → Enter opens the overlay.
- No-JS sanity check: `.work-row` and `.watch` both still carry real `href`s
  pointing at `/work/{slug}`, so the page degrades to plain navigation.
- Screenshot list view (collapsed + one row expanded) at 390px and 1440px.
- Gallery tile title is legible at both breakpoints, same size as the list
  view's title.
