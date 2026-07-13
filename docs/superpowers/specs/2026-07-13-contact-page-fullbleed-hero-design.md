# Contact page: full-bleed photo hero (supersedes CR-001 D6/CR-16)

Date: 2026-07-13
Status: approved, ready for implementation plan
Supersedes: CLAUDE.md's D6/CR-16 decision ("VU-meter photo as a band" on the
heritage pattern). This is new direction from the client, given after D6
shipped — CR-001 doesn't need to be edited, this doc is the record of the
change and why.

## Current implementation (being replaced)

Documented here in full so future changes can see exactly what existed
before this spec, without having to reconstruct it from git history.

**`src/pages/contacts.astro`** (as of commit `ae308dc`):

```astro
---
import { Image } from 'astro:assets';
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import HeritageBackground from '../components/HeritageBackground.astro';
import vuMeterPhoto from '../assets/studio/IMG_8950.jpg';
---
<BaseLayout title="contacts | kaloyan dimitrov" description="get in touch with kaloyan dimitrov — email, phone and socials for music, mix and sound design work.">
  <HeritageBackground />
  <Header current="contacts" />
  <main id="main">
    <section class="block contact-page">
      <div class="contact-photo-band">
        <Image src={vuMeterPhoto} alt="Neve 8803 and Drawmer VU meters in the studio" widths={[700, 1400]} sizes="(max-width: 900px) 100vw, 900px" />
      </div>
      <div class="eyebrow">contacts</div>
      <h2>let&rsquo;s talk sound</h2>
      <a class="mail" href="mailto:studio@kalodimitrov.com" data-blip>studio@kalodimitrov.com</a>
      <div class="lines">
        <a href="tel:+359000000000">+359 &middot;&middot;&middot; &middot;&middot;&middot; &middot;&middot;&middot;</a>
        <a href="#" data-blip>vimeo</a><a href="#" data-blip>imdb</a><a href="#" data-blip>linkedin</a>
      </div>
    </section>
  </main>
  <Footer />
</BaseLayout>
```

**`src/styles/global.css`** (current rules, ~lines 689-728 — line numbers will
drift as other work lands, match by selector):

```css
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

Today's layout: `<HeritageBackground />` pattern behind everything, a
centered 900px-max photo "band" (16:7), then centered eyebrow / h2 / mail /
phone+socials below it, all on the pattern.

## New design

Full-viewport hero section, matching the home feed's `.cue` treatment
(full-bleed photo + bottom gradient scrim + text on top), decided via Q&A:

1. **Reference pattern:** home feed cue style — full-color/full-opacity
   photo filling the screen, `var(--gradient-scrim)` (the exact token `.cue
   .shade` already uses) darkening toward the bottom, text sitting on that
   gradient. Not the opener's desaturated/30%-opacity/centered-text style.
2. **Content placement:** everything — eyebrow "contacts", headline "let's
   talk sound", email, phone, social links — sits over the photo in one
   `100svh` section. No second scrolled-in section.
3. **Alignment:** bottom-left, matching `.cue .meta`'s layout (not the
   current centered composition).
4. **Photo:** same asset, `IMG_8950` (Neve 8803 / Drawmer VU meters),
   **stays grayscale** — CR-10's photo→slot map designates this one B&W
   already (only `IMG_6235` and `IMG_6681` are the "unfiltered colour"
   photos per CR-10's colour policy); this spec only changes size/layout,
   not colour treatment. Goes full-bleed (`position: absolute; inset: 0;
   object-fit: cover`) instead of the current 900px-max band — needs wider
   Astro `Image` `widths`/`sizes` since it now covers full viewport width
   at high density (source is 4032×3024, plenty of headroom).
5. **Heritage pattern:** `<HeritageBackground />` is removed from this page
   — the full-bleed photo covers the entire section, there's no second area
   for the pattern to show through.
6. **Footer:** unchanged, still renders below the section (same pattern as
   footer scrolling in after the last home-feed cue).
7. **Contrast:** reuses the same scrim token already verified for cue text
   at CR-12 (≥4.5:1), so no new contrast work needed — same treatment,
   different page.
8. **Motion:** none. This is a static photo (no video source for this
   page), so no ken-burns push-in, no reduced-motion handling needed beyond
   what already exists sitewide.

## Acceptance criteria

- `/contacts` is a single `100svh` section: photo fills it, gradient scrim
  darkens the bottom, eyebrow/headline/email/phone/socials all sit on that
  gradient, bottom-left aligned.
- No heritage pattern visible on this page (removed, not just covered).
- Footer still reachable by scrolling past the section.
- Text meets ≥4.5:1 contrast against the photo (verify against the
  photo's brightest region under the text block, same method as CR-12).
- No horizontal overflow at 390px; email/phone/social links remain ≥44px
  tap targets (existing CR-13 requirement, must not regress).
- `npm run build` passes; screenshot at 390px and 1440px.
