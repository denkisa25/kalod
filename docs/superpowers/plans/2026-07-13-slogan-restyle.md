# Site-Wide Slogan Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the opener's "sound design · original music · final mix" and the header's "music + sound post" with one shared slogan — "sound design · original music · mix creative" — styled larger and in `var(--color-accent)`, everywhere the wordmark appears.

**Architecture:** Two independent text+CSS edits (opener markup/CSS, header markup/CSS) sharing the same new size/colour values. No JS changes — both lines are static text, no script currently reads or depends on their content.

**Tech Stack:** Astro components, vanilla CSS. No test framework — verification is `npm run build` plus Chrome DevTools MCP screenshots.

## Global Constraints

- No new `:root` colour token (TOKEN-GUARD) — reuses existing `var(--color-accent)`.
- lowercase text-transform — inherited from `body`, no action needed.
- No rendered text under 11px (CR-11) — new size floor is `0.85rem` (13.6px), well clear.

## Known gotcha for verification

`astro preview` on port 4321 serves prebuilt `dist/`, not live source:

```bash
npm run build
pkill -f "astro preview" 2>/dev/null; sleep 1
nohup npm run preview -- --port 4321 > /tmp/astro-preview.log 2>&1 & disown
sleep 2
```

---

### Task 1: Restyle the opener's sub-line

**Files:**
- Modify: `src/components/Opener.astro` (the `.sub` div's text content)
- Modify: `src/styles/global.css:1338` (the `#choice .sub` rule)

- [ ] **Step 1: Update the text in Opener.astro**

Find:
```astro
    <div class="sub">sound design · original music · final mix</div>
```
Replace with:
```astro
    <div class="sub">sound design · original music · mix creative</div>
```

- [ ] **Step 2: Restyle `#choice .sub`**

Find (`global.css:1338`):
```css
#choice .sub { font-size: 0.7rem; letter-spacing: 0.22em; color: var(--color-meta); margin-top: -14px; }
```
Replace with:
```css
#choice .sub { font-size: clamp(0.85rem, 1.8vw, 1.05rem); letter-spacing: 0.22em; color: var(--color-accent); margin-top: -14px; }
```

- [ ] **Step 3: Build**

Run: `npm run build` — expect `[build] Complete!`.

- [ ] **Step 4: Verify on the opener**

Rebuild+restart preview per the gotcha above, navigate to `http://localhost:4321/` at 1440×900, then via `evaluate_script`:

```js
() => {
  const sub = document.querySelector('#choice .sub');
  return { text: sub.textContent, color: getComputedStyle(sub).color, fontSize: getComputedStyle(sub).fontSize };
}
```

Expected: `text: "sound design · original music · mix creative"`, `color` resolves to the accent gold (rgb(201, 154, 85)), `fontSize` between 13.6px and 16.8px depending on viewport width.

Screenshot at 1440×900 and 390×844 (choice screen, before clicking either button) — confirm the line reads clearly, doesn't collide with the prompt above or the buttons below.

- [ ] **Step 5: Commit**

```bash
git add src/components/Opener.astro src/styles/global.css
git commit -m "$(cat <<'EOF'
Opener: restyle sub-line to the new site-wide slogan

"sound design · original music · final mix" -> "...mix creative",
larger and in the accent colour instead of muted meta grey. Part of
the site-wide slogan restyle - see
docs/superpowers/specs/2026-07-13-slogan-restyle-design.md.
EOF
)"
```

---

### Task 2: Replace the header's tagline

**Files:**
- Modify: `src/components/Header.astro` (the `.brand small` text content)
- Modify: `src/styles/global.css:136-144` (the `.brand small` rule)

**Interfaces:** None — `Header.astro` is used unmodified (same props) by `index.astro`, `work/index.astro`, `about.astro`, `contacts.astro`, and `work/[slug].astro`; this task only changes what's inside the component, not how it's called.

- [ ] **Step 1: Read the current rule and markup to confirm exact content**

Run: `grep -n "music + sound post" src/components/Header.astro` and `sed -n '124,144p' src/styles/global.css`

- [ ] **Step 2: Update the text in Header.astro**

Find:
```astro
  <a class="brand" href="/">kaloyan dimitrov<small>music + sound post</small></a>
```
Replace with:
```astro
  <a class="brand" href="/">kaloyan dimitrov<small>sound design · original music · mix creative</small></a>
```

- [ ] **Step 3: Restyle `.brand small`**

Find (`global.css:136-144`):
```css
.brand small {
  display: block;
  font-size: 0.7rem;
  letter-spacing: 0.22em;
  color: var(--color-meta);
  font-weight: 400;
  margin-top: 2px;
  text-transform: lowercase;
}
```
Replace with:
```css
.brand small {
  display: block;
  font-size: clamp(0.85rem, 1.8vw, 1.05rem);
  letter-spacing: 0.22em;
  color: var(--color-accent);
  font-weight: 400;
  margin-top: 2px;
  text-transform: lowercase;
}
```

- [ ] **Step 4: Build**

Run: `npm run build` — expect `[build] Complete!`.

- [ ] **Step 5: Verify across pages and both header states**

Rebuild+restart preview, then check each of these via `evaluate_script` (`() => document.querySelector('.brand small').textContent`, expect `"sound design · original music · mix creative"` every time):
- `/work`, `/about`, `/contacts`, `/work/viktoria-trailer-2` (hero header, permanently large per the prior header change)
- `/` before scrolling (hero + dimmed nav, unaffected by this change)
- `/` after scrolling past cue 01 (compact header) — confirm the text is still correct at the smaller compact size too, not just hero size

Also confirm no leftover occurrences: `grep -rn "music + sound post" src/` should return nothing.

Screenshot `/work` and `/` (both header states) at 1440×900 and 390×844 — confirm the bigger accent-coloured tagline doesn't crowd the nav links or wrap awkwardly at 390px.

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.astro src/styles/global.css
git commit -m "$(cat <<'EOF'
Header: replace "music + sound post" with the site-wide slogan

Same text and styling as the opener's restyled sub-line ("sound
design · original music · mix creative", larger, accent-coloured) -
one consistent slogan wherever the wordmark appears, instead of two
different taglines in two places. See
docs/superpowers/specs/2026-07-13-slogan-restyle-design.md.
EOF
)"
```
