# Contact Page Full-Bleed Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/contacts`' centered "photo band + text below, on the heritage pattern" layout with a single full-viewport hero section — the VU-meter photo full-bleed, a bottom gradient scrim, and all contact text (eyebrow/headline/email/phone/socials) overlaid bottom-left on top of it, matching the home feed's `.cue` treatment exactly.

**Architecture:** One new CSS block (`.contact-hero` + children) that mirrors `.cue`'s proven structure — `position: relative` container, an absolutely-positioned photo, an absolutely-positioned scrim using the existing `var(--gradient-scrim)` token, and a `position: relative; z-index: 2` text layer. This intentionally avoids negative `z-index` (unlike the pre-existing `.heritage-bg`/`.silence-photo` pattern) since `.cue` already proves the positive-z-index approach works without depending on an ancestor establishing a stacking context correctly. `contacts.astro` drops `<HeritageBackground />` and its old markup; the old `.contact-page`/`.contact-photo-band` CSS is deleted, not left dead.

**Tech Stack:** Astro (static output), vanilla CSS with custom properties. No test framework configured — verification is `npm run build` plus Chrome DevTools MCP screenshots/assertions, per this repo's established practice.

## Global Constraints

- lowercase text-transform — inherited automatically from `body { text-transform: lowercase; }`, no action needed.
- No new `:root` colour token (TOKEN-GUARD) — this plan only uses existing `var(--gradient-scrim)`, `var(--color-*)`, `var(--space-*)`, `var(--font-display)` tokens.
- Tap targets ≥44px (CR-13) — `.contact-hero .mail` and `.contact-hero .lines a` must each resolve to ≥44px tall (the current `.contact-page` versions of these do **not** have this today — this plan fixes that as part of the rebuild, per this spec's own acceptance criteria).
- No rendered text under 11px (CR-11) — reuses the existing `0.7rem`/`0.76rem` sizes already used elsewhere on this page, both already compliant.
- Contrast ≥4.5:1 (CR-12) — reuses `var(--gradient-scrim)`, the same token already verified against cue text at CR-12.
- Photo stays grayscale — `IMG_8950` is not one of CR-10's two "unfiltered colour" photos (`IMG_6235`, `IMG_6681`); this plan changes layout only, not colour treatment.

## Known gotcha for verification

The local server on port 4321 is `astro preview`, which serves the **prebuilt `dist/`**, not live source. Every verification step below assumes:

```bash
npm run build
pkill -f "astro preview" 2>/dev/null; sleep 1
nohup npm run preview -- --port 4321 > /tmp/astro-preview.log 2>&1 & disown
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/contacts   # expect 200
```

---

### Task 1: Full-bleed hero markup + CSS

**Files:**
- Modify: `src/pages/contacts.astro` (entire file)
- Modify: `src/styles/global.css:689-728` (replace `.contact-page`/`.contact-photo-band` rules with `.contact-hero` rules)

**Interfaces:** None — self-contained page + its own scoped CSS, no other file imports anything from this page.

- [ ] **Step 1: Read the current files to confirm exact content before editing**

Run: `cat src/pages/contacts.astro` and `sed -n '689,728p' src/styles/global.css`

Confirm they match what's quoted in `docs/superpowers/specs/2026-07-13-contact-page-fullbleed-hero-design.md`'s "Current implementation" section. If they don't match (someone else edited the page since the spec was written), stop and reconcile before proceeding.

- [ ] **Step 2: Rewrite `contacts.astro`**

Replace the entire file with:

```astro
---
import { Image } from 'astro:assets';
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import vuMeterPhoto from '../assets/studio/IMG_8950.jpg';
---
<BaseLayout title="contacts | kaloyan dimitrov" description="get in touch with kaloyan dimitrov — email, phone and socials for music, mix and sound design work.">
  <Header current="contacts" />
  <main id="main">
    <!-- full-bleed hero, matching the home feed's .cue treatment (see
         docs/superpowers/specs/2026-07-13-contact-page-fullbleed-hero-design.md) —
         supersedes CLAUDE.md's D6/CR-16 "photo as a band on the heritage
         pattern" decision. No <HeritageBackground /> on this page anymore:
         the photo covers the whole section, there's nothing for it to show
         through. -->
    <section class="contact-hero">
      <Image class="contact-photo" src={vuMeterPhoto} alt="Neve 8803 and Drawmer VU meters in the studio" widths={[900, 1800]} sizes="100vw" />
      <div class="contact-scrim" aria-hidden="true"></div>
      <div class="contact-meta">
        <div class="eyebrow">contacts</div>
        <h2>let&rsquo;s talk sound</h2>
        <a class="mail" href="mailto:studio@kalodimitrov.com" data-blip>studio@kalodimitrov.com</a>
        <div class="lines">
          <a href="tel:+359000000000">+359 &middot;&middot;&middot; &middot;&middot;&middot; &middot;&middot;&middot;</a>
          <a href="#" data-blip>vimeo</a><a href="#" data-blip>imdb</a><a href="#" data-blip>linkedin</a>
        </div>
      </div>
    </section>
  </main>
  <Footer />
</BaseLayout>
```

Note: `HeritageBackground` import and `<HeritageBackground />` are both removed — this page no longer uses it.

- [ ] **Step 3: Replace the CSS**

In `src/styles/global.css`, find (the block starting at the CR-16/D6 comment, currently lines 689-728):

```css
/* CR-16/D6 — the standalone /contacts page: light inversion dropped, sits
   on the heritage pattern instead (the home page's #contact teaser above
   is untouched — still "cinema", still light-inverted). */
.contact-page { text-align: center; padding-top: var(--space-6); }
.contact-page .eyebrow { color: var(--color-accent); }
.contact-page h2 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.9rem, 6vw, 4.4rem);
  line-height: 1.02;
  margin-bottom: 32px;
  color: var(--color-heading);
}
.contact-page .mail {
  display: inline-block;
  font-size: clamp(1rem, 3vw, 1.6rem);
  color: var(--color-ink);
  border-bottom: 2px solid var(--color-accent);
  padding-bottom: 4px;
  transition: color var(--dur-2);
}
.contact-page .mail:hover { color: var(--color-accent); }
.contact-page .lines {
  margin-top: 32px;
  font-size: 0.76rem;
  letter-spacing: 0.22em;
  color: var(--color-meta);
  display: flex; gap: 32px; justify-content: center; flex-wrap: wrap;
}
.contact-page .lines a:hover { color: var(--color-ink); }
.contact-photo-band {
  max-width: 900px;
  aspect-ratio: 16 / 7;
  overflow: hidden;
  margin: 0 auto var(--space-6);
}
.contact-photo-band img {
  width: 100%; height: 100%; object-fit: cover;
  filter: grayscale(1);
}
```

Replace it with:

```css
/* Full-bleed hero (supersedes D6/CR-16's "photo as a band on the heritage
   pattern" — see docs/superpowers/specs/2026-07-13-contact-page-fullbleed-hero-design.md).
   Mirrors .cue's structure exactly: positioned container, absolute photo,
   absolute scrim, then a position:relative; z-index:2 text layer — the
   same proven pattern .cue already uses, deliberately not the negative-
   z-index approach .heritage-bg/.silence-photo use (see the body stacking-
   context fix earlier in this file for why that pattern is fragile). */
.contact-hero {
  position: relative;
  height: 100svh;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}
.contact-hero .contact-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1);
}
.contact-hero .contact-scrim { position: absolute; inset: 0; background: var(--gradient-scrim); }
.contact-hero .contact-meta {
  position: relative;
  z-index: 2;
  width: 100%;
  text-align: left;
  padding: 0 clamp(20px, 4vw, 48px) clamp(26px, 6vh, 58px);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.contact-hero .eyebrow { color: var(--color-accent); }
.contact-hero h2 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2rem, 7vw, 5.4rem);
  line-height: 0.98;
  color: var(--color-heading);
}
.contact-hero .mail {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-height: 44px;
  font-size: clamp(1rem, 3vw, 1.6rem);
  color: var(--color-ink);
  border-bottom: 2px solid var(--color-accent);
  transition: color var(--dur-2);
}
.contact-hero .mail:hover { color: var(--color-accent); }
.contact-hero .lines {
  margin-top: 4px;
  font-size: 0.76rem;
  letter-spacing: 0.22em;
  color: var(--color-meta);
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}
.contact-hero .lines a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
.contact-hero .lines a:hover { color: var(--color-ink); }
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `[build] Complete!`, no errors.

- [ ] **Step 5: Restart preview and verify structure/stacking**

Follow the "Known gotcha" sequence, then at `http://localhost:4321/contacts` (1440×900), run via `evaluate_script`:

```js
() => {
  const hero = document.querySelector('.contact-hero');
  const heritage = document.querySelector('.heritage-bg');
  const photo = document.querySelector('.contact-photo');
  const meta = document.querySelector('.contact-meta');
  return {
    heroHeight: hero.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
    heritagePresent: !!heritage,
    photoNaturalSize: { w: photo.naturalWidth, h: photo.naturalHeight },
    metaZIndex: getComputedStyle(meta).zIndex,
    metaTextAlign: getComputedStyle(meta).textAlign,
  };
}
```

Expected: `heroHeight` ≈ `viewportHeight` (within a few px), `heritagePresent: false` (component fully removed from this page), `photoNaturalSize` non-zero, `metaZIndex: "2"`, `metaTextAlign: "left"`.

- [ ] **Step 6: Verify tap targets (CR-13) and contrast-carrying scrim**

```js
() => {
  const mail = document.querySelector('.contact-hero .mail');
  const lines = Array.from(document.querySelectorAll('.contact-hero .lines a'));
  const scrim = getComputedStyle(document.querySelector('.contact-scrim')).backgroundImage;
  return {
    mailHeight: mail.getBoundingClientRect().height,
    lineHeights: lines.map((a) => a.getBoundingClientRect().height),
    scrimIsGradient: scrim.includes('gradient'),
  };
}
```

Expected: `mailHeight` ≥ 44, every value in `lineHeights` ≥ 44, `scrimIsGradient: true`.

- [ ] **Step 7: Screenshot at 1440px and 390px**

Take screenshots at both breakpoints. Confirm visually:
- Photo fills the entire viewport height, grayscale.
- Scrim darkens toward the bottom; eyebrow/headline/email/phone/socials all sit on it, bottom-left aligned, legible.
- No heritage pattern visible anywhere on this page.
- No horizontal overflow at 390px.

- [ ] **Step 8: Regression check — confirm other pages still show the heritage pattern**

`/contacts` no longer uses `HeritageBackground`, but `/work`, `/about`, and `/404` still should. Quick check:

```js
() => !!document.querySelector('.heritage-bg')
```

Run this on `/work`, `/about`, and `/404` (navigate to each first) — expect `true` on all three, `false` only on `/contacts`.

- [ ] **Step 9: Commit**

```bash
git add src/pages/contacts.astro src/styles/global.css
git commit -m "$(cat <<'EOF'
Contact page: full-bleed photo hero, supersedes D6/CR-16

Replaces the centered "photo band + text below, on the heritage
pattern" layout with a single full-viewport section matching the home
feed's .cue treatment: the VU-meter photo full-bleed, a gradient scrim,
and eyebrow/headline/email/phone/socials overlaid bottom-left on top of
it. HeritageBackground is dropped from this page - the photo now covers
the whole section. New client direction, given after D6 shipped; see
docs/superpowers/specs/2026-07-13-contact-page-fullbleed-hero-design.md
for the full before/after record.

Also brings the contact links up to the CR-13 44px tap-target floor,
which the previous centered layout didn't meet.
EOF
)"
```
