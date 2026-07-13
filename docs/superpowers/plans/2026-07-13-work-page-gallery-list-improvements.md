# Work Page: Gallery Tile Legibility + List Inline Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the undersized gallery tile title text, and replace the work-list row's full-page navigation with an inline accordion that shows role/client/description plus a "watch full video" link reusing the existing shared overlay player.

**Architecture:** Two independent, unrelated changes living in the same page (`/work`), so they're two separate tasks. Task 1 is a one-line CSS fix. Task 2 adds a sibling `<div class="work-detail">` panel next to each `.work-row` (not nested inside it — an `<a>` can't validly nest inside another `<a>`, and the panel needs its own "watch full video" link), toggled by a new `initListExpand()` function in `work-page.ts`, styled with new CSS reusing the site's existing `.dcol`/`.lbl` visual language. The watch link needs no new player code — it reuses the `.watch[data-idx]` click-delegation already wired globally in `video-layer.ts`.

**Tech Stack:** Astro (static output), vanilla TypeScript islands, vanilla CSS with custom properties. No test framework is configured in this repo (no vitest/playwright/jest) — verification is `npm run build` (type-checks `.astro`/`.ts` files) plus scripted browser assertions via Chrome DevTools MCP (`evaluate_script` / `take_screenshot`), matching how prior fixes in this project were verified.

## Global Constraints

(from `CLAUDE.md` / the CR-001 change requests — copied verbatim where relevant to this work)

- lowercase text-transform everywhere — already enforced globally via `body { text-transform: lowercase; }` in `global.css:23-29`; no new CSS needed for this, all new copy ("role", "client", "watch full video") is lowercased automatically by inheritance.
- No new `:root` colour token may be added without explicit sign-off (TOKEN-GUARD) — every new CSS rule in this plan uses only existing `var(--color-*)` / `var(--space-*)` / `var(--dur-*)` tokens, no hex literals.
- Tap targets ≥44px (CR-13) — the new `.work-detail .watch` link must keep `min-height: 44px`, matching every other interactive control in this codebase.
- No rendered text below 11px (CR-11) — the new `.work-detail` text reuses the existing `0.7rem`/`0.76rem` sizes already used elsewhere on this page (`.dcol`, `.lbl`), both already CR-11-compliant.
- `/work/[slug].astro` (the standalone per-project page) must keep working exactly as before — `phase0/extraction/redirect-map.csv` 301-redirects every legacy WordPress URL straight into `/work/{slug}/`, and this plan does not touch that file.

## Known gotcha for whoever runs the verification steps

This repo's local server on port 4321 is typically `astro preview`, which serves the **prebuilt `dist/` output**, not live source. Editing a `.astro`/`.ts`/`.css` file does **not** change what that server returns until you rebuild and restart it. Every verification step below assumes this sequence:

```bash
npm run build
pkill -f "astro preview" 2>/dev/null; sleep 1
nohup npm run preview -- --port 4321 > /tmp/astro-preview.log 2>&1 & disown
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/work/   # expect 200
```

If a browser tab from a previous session is already open against `localhost:4321`, navigate/reload it — don't assume a stale tab reflects the new build.

---

### Task 1: Gallery tile title font size

**Files:**
- Modify: `src/styles/global.css:1058-1063` (the `.tile-title` rule)

**Interfaces:** None — pure CSS value change, no new selectors, no markup/JS changes.

- [ ] **Step 1: Read the current rule to confirm line numbers before editing**

Run: `grep -n "tile-title" src/styles/global.css`
Expected output includes `1058:.tile-title {`

- [ ] **Step 2: Change the font-size to match `.work-row .t`**

In `src/styles/global.css`, find:

```css
.tile-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(0.95rem, 1.6vw, 1.15rem);
  color: var(--color-heading);
}
```

Replace with:

```css
.tile-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.1rem, 2.6vw, 1.7rem);
  color: var(--color-heading);
}
```

(This is the exact same `font-size` value as `.work-row .t` at `global.css:1004` — intentional, per the client's request that gallery tile titles match list-view title size.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `[build] Complete!`, no errors.

- [ ] **Step 4: Restart preview and verify the computed size matches list view**

Follow the "Known gotcha" sequence above to rebuild + restart the preview server, then in a browser at `http://localhost:4321/work/` (1440×900 viewport), run via the Chrome DevTools MCP `evaluate_script` tool:

```js
() => {
  // switch to list view to read a real (non-display:none) .work-row .t
  document.querySelector('.view-switch button[data-view="list"]').click();
  const listSize = getComputedStyle(document.querySelector('.work-row .t')).fontSize;
  // switch back to gallery to read a real .tile-title
  document.querySelector('.view-switch button[data-view="gallery"]').click();
  const tileSize = getComputedStyle(document.querySelector('.tile-title')).fontSize;
  return { listSize, tileSize, match: listSize === tileSize };
}
```

Expected: `match: true` (both resolve to the same pixel value at this viewport width, e.g. `"27.2px"` at 1440px — exact number doesn't matter, equality does).

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css
git commit -m "$(cat <<'EOF'
Increase gallery tile title font size to match list view

The gallery tile title was noticeably smaller than its list-view
equivalent and hard to read. Match .tile-title's font-size to
.work-row .t exactly.
EOF
)"
```

---

### Task 2: List view inline expand + shared watch-full-video link

**Files:**
- Modify: `src/pages/work/index.astro:46-62` (the `#workList` markup)
- Modify: `src/styles/global.css:1008` and `:1011` (rename `.arrow` to `.chevron`, add expanded-state rotation)
- Modify: `src/styles/global.css` (insert new `.work-detail` rules after the `.work-row` media-query block, before the `WORK GALLERY` section comment — currently around line 1016)
- Modify: `src/scripts/work-page.ts` (add `initListExpand()`, call it from `initWorkPage()`)

**Interfaces:**
- Consumes: the existing global `.watch[data-idx]` click-delegation already registered inside `initDetailOverlay()` in `src/scripts/video-layer.ts` (added in a prior session) — this task does not modify `video-layer.ts`, it only adds more `.watch[data-idx]` anchors to the DOM for that existing listener to pick up.
- Consumes: `roleLine`, `pad` from `src/lib/format.ts` (already imported in `work/index.astro`) and `p.excerpt` / `p.client` / `p.roles` from the `projects` array (already in scope in that file's frontmatter).
- Produces: `initListExpand(): void`, exported indirectly by being called inside the existing exported `initWorkPage(): void` in `src/scripts/work-page.ts` — no new export needed, no other file calls `initListExpand` directly.

- [ ] **Step 1: Read the current work-list markup to confirm exact current content**

Run: `sed -n '46,62p' src/pages/work/index.astro`

Expected to see the current `<ol class="work-list" id="workList" hidden>` block ending with `<span class="arrow" aria-hidden="true">&rarr;</span>` inside each row's closing `</a></li>`.

- [ ] **Step 2: Replace the work-list markup**

In `src/pages/work/index.astro`, find:

```astro
    <div class="work-index">
      <ol class="work-list" id="workList" hidden>
        {projects.map((p, i) => (
          <li>
            <a class="work-row" href={`/work/${p.slug}`} data-roles={p.roles.join(',')}>
              <span class="thumb">
                <Image src={p.poster} alt="" width={160} height={90} />
              </span>
              <span class="n">{pad(i + 1)}</span>
              <span class="t">{p.title}</span>
              <span class="r">{roleLine(p.roles)}{p.client && <> &middot; {p.client}</>}</span>
              <span class="arrow" aria-hidden="true">&rarr;</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
```

Replace with:

```astro
    <div class="work-index">
      <ol class="work-list" id="workList" hidden>
        {projects.map((p, i) => (
          <li>
            <a
              class="work-row"
              href={`/work/${p.slug}`}
              data-roles={p.roles.join(',')}
              aria-expanded="false"
              aria-controls={`workDetail-${i}`}
            >
              <span class="thumb">
                <Image src={p.poster} alt="" width={160} height={90} />
              </span>
              <span class="n">{pad(i + 1)}</span>
              <span class="t">{p.title}</span>
              <span class="r">{roleLine(p.roles)}{p.client && <> &middot; {p.client}</>}</span>
              <span class="chevron" aria-hidden="true">&darr;</span>
            </a>
            <div class="work-detail" id={`workDetail-${i}`} hidden>
              <div class="dcol"><div class="lbl">role</div><b>{roleLine(p.roles)}</b></div>
              {p.client && <div class="dcol"><div class="lbl">client</div><b>{p.client}</b></div>}
              {p.excerpt && <p class="desc">{p.excerpt}</p>}
              <a class="watch" href={`/work/${p.slug}`} data-idx={i} data-blip>watch full video</a>
            </div>
          </li>
        ))}
      </ol>
    </div>
```

Note: `.work-detail` is a **sibling** of `.work-row` inside the same `<li>`, not nested inside it. The row keeps its real `href` — it still works as a plain link with JS disabled or for crawlers; Step 5 below makes JS intercept its click instead of letting it navigate.

- [ ] **Step 3: Update the arrow → chevron CSS and add the rotation on expand**

Run: `grep -n "work-row .arrow\|work-row:hover .arrow" src/styles/global.css`

Find these two lines (around `global.css:1008` and `:1011`):

```css
.work-row .arrow { color: var(--color-meta); transition: transform var(--dur-2) var(--ease-out); flex-shrink: 0; }
```

and

```css
.work-row:hover .arrow { transform: translateX(4px); color: var(--color-accent); }
```

Replace the first with:

```css
.work-row .chevron { color: var(--color-meta); transition: transform var(--dur-2) var(--ease-out), color var(--dur-2); flex-shrink: 0; }
```

Replace the second with:

```css
.work-row:hover .chevron { color: var(--color-accent); }
.work-row[aria-expanded="true"] .chevron { transform: rotate(180deg); }
```

- [ ] **Step 4: Add the `.work-detail` panel styles**

In `src/styles/global.css`, immediately after the `.work-row` mobile media query block (the one containing `.work-row .thumb { width: 72px; }`) and before the `/* ===... WORK GALLERY ... === */` comment, insert:

```css
/* inline expand (role/client/description + the shared "watch full video"
   link, which opens the same overlay player gallery view uses via
   video-layer.ts's existing .watch[data-idx] delegation — no new player
   code here). Lives as a sibling of .work-row, not a child: an <a> can't
   validly nest inside another <a>, and this panel needs its own link. */
.work-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-4);
  padding: 0 0 var(--space-4);
}
.work-detail .dcol { flex: 1 1 160px; font-size: 0.76rem; line-height: 1.85; color: var(--color-meta); }
.work-detail .dcol b { display: block; font-weight: 400; color: var(--color-ink); }
.work-detail .dcol .lbl { font-size: 0.7rem; letter-spacing: 0.22em; color: var(--color-accent); margin-bottom: 5px; }
.work-detail .desc { flex: 2 1 320px; font-size: var(--text-body); line-height: 1.7; color: var(--color-ink); }
.work-detail .watch {
  flex: 1 1 100%;
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  color: var(--color-accent);
  min-height: 44px;
  display: flex;
  align-items: center;
  transition: color var(--dur-2);
}
.work-detail .watch:hover, .work-detail .watch:focus-visible { color: var(--color-heading); }
/* CR-6's shared role-filter toggles a .hidden CLASS on .work-row when a
   row doesn't match the active filter — it never touches .work-detail
   directly (that module is intentionally generic across 3 surfaces, see
   role-filter.ts). Without this rule, a row's expanded panel could stay
   visible under a header the filter just hid. */
.work-row.hidden + .work-detail { display: none; }
```

- [ ] **Step 5: Add `initListExpand()` to `work-page.ts`**

Read the current file first: `cat src/scripts/work-page.ts`

In `src/scripts/work-page.ts`, add this new function after `initGalleryPreviews()` (i.e., right before the `export function initWorkPage()` block):

```typescript
/** List view rows expand inline instead of navigating to the standalone
 *  project page. The row keeps its real href (no-JS / crawler / redirect-
 *  map fallback — see phase0/extraction/redirect-map.csv); this listener
 *  intercepts the click and toggles a sibling panel instead. Accordion:
 *  opening a row closes whichever row was previously open. */
function initListExpand(): void {
  const rows = document.querySelectorAll<HTMLAnchorElement>('.work-row');
  if (!rows.length) return;

  let openRow: HTMLAnchorElement | null = null;

  function panelFor(row: HTMLAnchorElement): HTMLElement | null {
    const id = row.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  function close(row: HTMLAnchorElement): void {
    const panel = panelFor(row);
    if (panel) panel.hidden = true;
    row.setAttribute('aria-expanded', 'false');
  }

  function open(row: HTMLAnchorElement): void {
    if (openRow && openRow !== row) close(openRow);
    const panel = panelFor(row);
    if (panel) panel.hidden = false;
    row.setAttribute('aria-expanded', 'true');
    openRow = row;
  }

  rows.forEach((row) => {
    row.addEventListener('click', (e) => {
      e.preventDefault();
      if (row.getAttribute('aria-expanded') === 'true') {
        close(row);
        openRow = null;
      } else {
        open(row);
      }
    });
  });
}
```

Then update `initWorkPage()` to call it — find:

```typescript
export function initWorkPage(): void {
  initViewSwitch();
  initRoleFilter({
    items: document.querySelectorAll<HTMLElement>('.work-row, .gallery-tile'),
    emptyState: document.getElementById('workEmpty'),
  });
  initGalleryPreviews();
}
```

Replace with:

```typescript
export function initWorkPage(): void {
  initViewSwitch();
  initRoleFilter({
    items: document.querySelectorAll<HTMLElement>('.work-row, .gallery-tile'),
    emptyState: document.getElementById('workEmpty'),
  });
  initGalleryPreviews();
  initListExpand();
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: `[build] Complete!`, no errors. If Astro's type checker flags `aria-controls`/`aria-expanded` as unrecognized props, they are standard HTML attributes and should pass through — if this errors, check for a typo rather than removing the attributes.

- [ ] **Step 7: Restart preview and verify expand/collapse + accordion behavior**

Follow the "Known gotcha" rebuild+restart sequence, then at `http://localhost:4321/work/` (1440×900), switch to list view and run via `evaluate_script`:

```js
() => {
  document.querySelector('.view-switch button[data-view="list"]').click();
  const rows = document.querySelectorAll('.work-row');
  const row0 = rows[0], row1 = rows[1];
  const panel0 = document.getElementById(row0.getAttribute('aria-controls'));
  const panel1 = document.getElementById(row1.getAttribute('aria-controls'));

  row0.click();
  const afterFirstClick = {
    row0Expanded: row0.getAttribute('aria-expanded'),
    panel0Hidden: panel0.hidden,
    urlUnchanged: location.pathname === '/work/',
  };

  row1.click();
  const afterSecondClick = {
    row0Expanded: row0.getAttribute('aria-expanded'), // should be back to false — accordion
    panel0Hidden: panel0.hidden,                        // should be true again
    row1Expanded: row1.getAttribute('aria-expanded'),
    panel1Hidden: panel1.hidden,
  };

  row1.click(); // collapse it again
  const afterCollapse = {
    row1Expanded: row1.getAttribute('aria-expanded'),
    panel1Hidden: panel1.hidden,
  };

  return { afterFirstClick, afterSecondClick, afterCollapse };
}
```

Expected:
- `afterFirstClick`: `{ row0Expanded: "true", panel0Hidden: false, urlUnchanged: true }`
- `afterSecondClick`: `{ row0Expanded: "false", panel0Hidden: true, row1Expanded: "true", panel1Hidden: false }` (accordion — opening row1 closed row0)
- `afterCollapse`: `{ row1Expanded: "false", panel1Hidden: true }`

- [ ] **Step 8: Verify the panel's watch-full-video link opens the shared overlay**

Still in the same browser session, run via `evaluate_script`:

```js
() => {
  const row0 = document.querySelectorAll('.work-row')[0];
  row0.click(); // expand it
  const panel0 = document.getElementById(row0.getAttribute('aria-controls'));
  const watchLink = panel0.querySelector('.watch');
  watchLink.click();
  const detail = document.getElementById('detail');
  return {
    detailOpen: detail.classList.contains('open'),
    title: document.getElementById('dName').textContent,
    rowStillExpanded: row0.getAttribute('aria-expanded'), // row shouldn't collapse just because the overlay opened
  };
}
```

Expected: `detailOpen: true`, `title` matches the first project's title (whatever `projects[0].title` resolves to after the date-sort in `work/index.astro`), `rowStillExpanded: "true"`.

Close the overlay afterward: `document.getElementById('dClose').click()`.

- [ ] **Step 9: Verify a filtered-out row's panel doesn't stay visible**

```js
() => {
  document.querySelector('.filter[data-f="music"]').click();
  const rows = Array.from(document.querySelectorAll('.work-row'));
  const hiddenRow = rows.find((r) => r.classList.contains('hidden'));
  if (!hiddenRow) return { skipped: 'no row was filtered out — check filter button selector' };
  hiddenRow.click(); // try to expand a filtered-out row
  const panel = document.getElementById(hiddenRow.getAttribute('aria-controls'));
  const panelDisplay = getComputedStyle(panel).display;
  document.querySelector('.filter[data-f="all"]')?.click(); // reset
  return { panelDisplay }; // expect "none" regardless of aria-expanded state
}
```

Expected: `panelDisplay: "none"` — the `.work-row.hidden + .work-detail { display: none; }` rule wins even if the row's own click handler still flips `aria-expanded`/`hidden`.

- [ ] **Step 10: Keyboard check**

```js
() => {
  document.querySelector('.view-switch button[data-view="list"]').click();
  const row0 = document.querySelectorAll('.work-row')[0];
  row0.focus();
  row0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  // jsdom-style keydown doesn't auto-trigger a real anchor click in all
  // engines — the real check is a manual Tab+Enter pass in Step 11's
  // screenshot pass, this is just a smoke check that the row is still
  // keyboard-focusable and didn't navigate away from /work/.
  return { stillOnWorkPage: location.pathname === '/work/', focused: document.activeElement === row0 };
}
```

Expected: `stillOnWorkPage: true`, `focused: true`. Follow up with an actual manual Tab → Enter → Tab → Enter pass while taking the Step 11 screenshots to confirm the real keyboard flow (focus row → Enter expands → Tab reaches the watch link → Enter opens the overlay).

- [ ] **Step 11: Screenshot list view at both breakpoints**

At 1440×900 and 390×844, with list view active and one row expanded, take a screenshot via the Chrome DevTools MCP `take_screenshot` tool. Confirm visually:
- The chevron points up (rotated) on the expanded row and down on all others.
- Role / client / description text is legible and not overlapping the row below.
- The "watch full video" link is present and reads as a link (accent color).
- No horizontal overflow at 390px.

- [ ] **Step 12: Commit**

```bash
git add src/pages/work/index.astro src/styles/global.css src/scripts/work-page.ts
git commit -m "$(cat <<'EOF'
List view: expand rows inline instead of navigating to a new page

Clicking a work-list row now expands role/client/description plus a
"watch full video" link in place, accordion-style, instead of
navigating to the standalone /work/[slug] page. That page is untouched
and still reachable (row href, watch link href, and the redirect-map
301s all still point at it) — this only changes what a JS-enabled
click on the row does. The watch link reuses the existing shared
overlay player via the .watch[data-idx] delegation already wired in
video-layer.ts, so no new player code was needed.
EOF
)"
```
