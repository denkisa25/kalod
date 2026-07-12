# ⚠️ TOKEN GUARD — read before executing ANY part of CR-001

**Status: the live build already carries the real brand tokens, extracted from the
legacy site in Phase 0. They are correct. CR-001 must NOT overwrite them.**

The CR-001 documents were written against the *concept prototype*, which used
placeholder colours and fonts invented before extraction. Every hardcoded hex,
rgba() and font name in those documents is **illustrative, not authoritative**.

## RULE
> Wherever `cr-001-visual.md` or `cr-001-addendum-and-session.md` shows a literal
> colour, font, spacing or duration value, **ignore the literal and use the
> corresponding existing token**. If a CR seems to require a value with no token,
> stop and ask — do not invent one, and do not redefine an existing one.
>
> **No new colour may be added to `:root` without explicit sign-off.**

## The live token set (do not change these values)

```css
/* colour — EXTRACTED FROM THE LEGACY SITE, AUTHORITATIVE */
--color-accent:  #c99a55;   /* gold / brown — the brand accent */
--color-bg:      #0e0f10;
--color-heading: #fff;
--color-ink:     #c9c9cb;
--color-line:    color-mix(in srgb, #c9c9cb 20%, transparent);
--color-meta:    color-mix(in srgb, #c9c9cb 60%, transparent);
--color-scrim:   color-mix(in srgb, #0e0f10 60%, black);
--focus-ring:    #c99a55;
--gradient-scrim:  linear-gradient(180deg, color-mix(in srgb,#0e0f10 25%,transparent) 0%, transparent 35%, color-mix(in srgb,#0e0f10 92%,transparent) 100%);
--surface-gradient: radial-gradient(120% 90% at 12% -10%, color-mix(in srgb,#c99a55 16%,#0e0f10) 0%, #0e0f10 55%);

/* type — EXTRACTED, AUTHORITATIVE */
--font-display: "Agency FB", "Bahnschrift", "Arial Narrow", sans-serif;
--font-body:    Verdana, Geneva, sans-serif;
--text-hero: clamp(2.5rem,8vw,7rem);  --text-h2: clamp(1.5rem,3vw,2.5rem);
--text-body: clamp(1rem,1.1vw,1.125rem);
--text-meta-size: .75rem;  --text-meta-tracking: .08em;

/* space / motion / layer */
--space-1..8: 4 8 16 24 40 64 104 168px
--dur-1..4: .15s .3s .6s 1.2s   --ease-out: cubic-bezier(.16,1,.3,1)   --radius: 0
--z-skip-link, --z-nav-affordance, --z-header, --z-mobile-nav, --z-detail, --z-opener
```

## Translation table — CR-001 literal → what to actually use

| CR-001 says | Do NOT use | Use instead |
|---|---|---|
| `#0b0b0d`, `rgba(11,11,13,…)` | ✗ | `var(--color-bg)` / `color-mix` on it |
| "amber", `#e2a13c` | ✗ | `var(--color-accent)` (`#c99a55`) |
| `#e9e4da` (warm ink) | ✗ | `var(--color-ink)` (`#c9c9cb`) |
| `Archivo` (any weight/width) | ✗ | `var(--font-display)` / `var(--font-body)` |
| Archivo variable-font tricks (`font-variation-settings`, wdth/wght animation) | ✗ | **Agency FB / Bahnschrift are not variable fonts.** Achieve emphasis with size, tracking and colour instead. Do not animate weight. |
| CR-1 wordmark `wght 640 / wdth 76` | ✗ | `var(--font-display)` at `clamp(2.2rem,7vw,5.5rem)`; no variation settings |
| CR-16 `background-color: #4a5a6a` | ✗ | sample the actual bottom row of `bgr.jpg` at build time, or expose as ONE new token `--color-pattern-base` — **requires sign-off** |
| CR-16 `--color-surface-steel: #506070` | ✗ | **do not add** unless the client signs off on a second brand colour |
| CR-16 tint `rgba(11,11,13,.55)` | ✗ | `color-mix(in srgb, var(--color-bg) 55%, transparent)` |
| CR-11 "floor meta text at 11px" | — | raise `--text-meta-size` from `.75rem` (12px) only if any *computed* size falls below 11px; adjust `--text-meta-tracking` from `.08em` if tracking exceeds `.22em` anywhere |
| CR-9 blur / brightness values | ok as literals | they're effects, not brand |

## The one genuine open question this raises

The pattern (`bgr.jpg`) is **steel blue-grey** (`#607080`, `#506070`).
The brand accent is now **gold/brown** (`#c99a55`) on near-black.
Steel-blue and gold-brown are close to complementary — dropped in raw, the pattern
will fight the palette rather than support it.

Three honest options, in order of my preference:

1. **Duotone the pattern into the palette.** Recolour `bgr.jpg` at build time to
   run from `--color-bg` to a low-saturation tint of `--color-accent`. It keeps the
   texture and the *shape* of the legacy background — which is what the client
   actually responds to — while staying inside the system. Costs one build step.
2. **Desaturate it heavily** (grayscale + heavy tint) so its blue disappears and it
   becomes a neutral texture under the gold.
3. **Keep it steel and adopt it as a second brand colour.** Honest to the legacy
   site, but it makes the palette three-way (black / gold / steel) and needs the
   client to accept it as deliberate.

**Recommendation: (1).** Show the client (1) and (3) side by side — this is exactly
the "how much of the old palette do you want back" conversation, and the pattern is
where it gets decided.

## Verification (add to every session's exit check)
```bash
# no new/changed :root colour tokens
git diff --stat -- src/styles/tokens.css   # expect: no change, unless signed off
# no hardcoded hexes introduced outside the token file
grep -rInE '#[0-9a-fA-F]{3,8}\b' src --include=*.astro --include=*.ts --include=*.css \
  | grep -v 'tokens.css'                    # expect: empty
```
Also: screenshot the opener, work, about and contacts **before** Session 5 and
compare after — the palette must be visually identical except where a CR
deliberately changes it.
