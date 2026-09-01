# Portfolio — build notes

Scaffolded from the real Figma file (Product Portfolio), not guessed. Tokens, copy, and structure pulled directly from the design context.

## What's real vs. placeholder

**Real, pulled from Figma:**
- All colors, spacing, radii, and type scale in `styles.css` (`:root` custom properties)
- Fonts: Syne (headings), Work Sans (body — including the bold emphasis stat lines and footer legal text, which the original Figma file had set to Open Sans; consolidated to Work Sans per your instruction, loaded at 400/500/700)
- All copy on the home page — hero, both Featured cards, all four Archive cards, testimonial, About, footer

**Real assets, now wired up (`/Assets`):**
- Logo mark in the header — `Logo.svg`
- Company wordmarks in the hero strip — `wordmark_Qwick.svg`, `wordmark_Airtime.svg`, `wordmark_Chick-fil-A.svg`, `wordnmark_Attentive.svg` (note the typo in that filename — left as-is), `wordmark_Fullstory.svg`, `wordmark_Mailchimp.svg`
- Featured Work images — `Recommended Pros.jpg` (marketplace matching screen, shows the trust signals the case study copy references) and `Brand Announcement 1.png` (gigpro rebrand photo grid)
- Archive avatars — `Avatar_attentive.png`, `avatar_chick-fil-a.png`, `Fullstory_avatar.png`, `avatar_mailchimp.png`
- Headshot in the About section — `Headshot.jpg`

**Fixed along the way:**
- `wordmark_Mailchimp.svg` had a `viewBox` narrower than its own path data (129 wide vs. content extending to x=138), clipping the wordmark's last letters. Widened the `viewBox`/`width` to 140 — no path data touched, just stopped it clipping itself.
- Archive card headings (`h3`) were invisible on the dark Archive background — the base `h3 { color: var(--color-text) }` rule (dark) was more specific than inherited white from `.archive-card`, since it's an explicit declaration on the element itself, not inheritance. Added `.archive-card h3 { color: inherit; }` in `styles.css`.

## Interactions implemented

- **Hover lift + shadow on Featured Work cards** and **Archive cards** — pure CSS, `transform` + `box-shadow` transitions.
- **CTA arrow nudge** on "Read the case study →" links — pure CSS, no JS needed.
- **Image scale-on-hover** inside Featured card thumbnails, a small added touch beyond what we discussed, subtle (1.02x), remove if it feels like too much once you see it live.

## Built but intentionally unused on this page

`script.js` includes two utilities, ready for the case study pages when you build those next:

- `initScrollReveal()` — IntersectionObserver-based fade/slide-up, triggers once per element, respects `prefers-reduced-motion`. Add `data-reveal` to any element to opt it in; wrap a group of siblings in `data-reveal-group` for a staggered cascade (see the `nth-child` delays in `styles.css`).
- `initCountUp()` — animates a number from 0 to a target on scroll-into-view. Add `data-count-to="79" data-count-suffix="%"` to a `<span>`. Use once per case study page, on your strongest stat, not on every number.

Both are already wired up on `DOMContentLoaded` in `script.js` — nothing extra to initialize, just add the `data-*` attributes when you build the case study markup.

## Next steps in Claude Code

1. Build `case-study-trust.html` and `case-study-brand.html` using the same `styles.css`/`script.js` — this is where `data-reveal` and `data-count-to` actually get used.
2. Confirm the Google Fonts `<link>` in `index.html`'s `<head>` loads correctly, or self-host the fonts if you'd rather not depend on Google's CDN.
3. Push to GitHub, connect to Vercel for auto-deploy, same workflow as your old site.
4. Test responsive behavior below 860px (Archive grid collapses to 1 column) and below 780px (About section stacks) — visually verified at desktop width in this session; still worth a pass at narrower widths.
