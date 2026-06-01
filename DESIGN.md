# Design System: react-example (NYX)
**Project ID:** local/react-example

## 1. Visual Theme & Atmosphere

The interface is a modern, high-contrast developer-oriented UI with a vibrant-but-refined accent. It feels crisp and focused: utilitarian for content and tooling, yet polished by careful typography and subtle motion. The overall mood is "clinical modernity" — clear information hierarchy with occasional luminous accents that draw attention without visual clutter.

## 2. Color Palette & Roles

- Primary Blue (Apple) — #0071E3 — Standard Apple system blue for CTAs and interactive states.
- Background (Light) — #FCF9F2 — Premium warm cream app background.
- Foreground (Light) — #1D1D1F — Primary Apple-style deep gray text.
- Card / Surface — #FFFFFF — Clean white card surfaces for contrast against cream.
- Secondary Surface — #F0EDE8 — Muted cream for sidebar and secondary areas.

- Background (Dark) — #0B0E14 — Deep Space Slate-Charcoal for a highly professional look and reduced eye strain.
- Foreground (Dark) — #E6EDF3 — Off-white text for excellent contrast and legibility.
- Card (Dark) — #111622 — Surface Deep Card Fill for elevated card elements.
- Secondary Surface (Dark) — #4A5059 — Thundercloud Ash for secondary sidebars, borders, and inner elements.
- Primary Accent (Dark) — #FF3366 — Flame Azalea for high-contrast interactive highlights.

Design tokens live as CSS custom properties (see src/index.css) and should be referenced semantically (e.g., var(--color-primary) / var(--color-background)).

## 3. Typography Rules

- Primary sans: Geist Variable, fallback Inter, then system sans. Use variable font axes for weight/optical size when possible.
- Monospace: JetBrains Mono for code blocks and compact metadata.
- Character: Modern geometric sans with good x-height and clear legibility.

Hierarchy guidance (web-relative):
- H1 / Display: bold/semibold, large scale (approx. 2.25–3rem) for primary screens.
- H2: semibold, ~1.5–2rem.
- Body: regular (400), 1rem with comfortable line-height.
- Code/Mono: 0.85–0.95rem for inline code, monospace for blocks.

Use subtle letter-spacing and maintain selection styling using the primary hue (selection:bg-primary/25).

## 4. Component Stylings

- Buttons: Border-radius from --radius (0.5rem / 8px). Primary buttons use --primary (#0071E3 in light / #FF3366 in dark) with appropriate primary-foreground text color, medium weight. Hover: subtle darken or Flame Azalea highlight; focus: glow using --ring.
- Sidebar: Uses --secondary surface with clean border-r border-border styling and hover transitions using --muted/40. Action items (+ New chat) are styled neutrally when inactive rather than retaining redundant active highlights.
- Cards/Containers/Prompt Box: Background uses --card/--card/70; hairline border using --border; shadow minimal. Card corner radius slightly larger than controls for gentle separation.
- Inputs/Forms: 1px refined border, background from --input or --muted/40, focus border shifts to --ring with gentle glow.
- Toasts/Popovers/Model Selectors: Use bg-card/98, --border, and --muted/40 hover lists for complete dark/light theme integration.
- Motion: Small, springy easing (--ease-spring) for interactive reveals; shimmer and drift keyframes for decorative uses only.

## 5. Layout Principles

- Clean, content-first layout with wide horizontal breathing room. Body uses smooth scrolling and restrained max width for reading contexts.
- Spacing: Use an 8px micro grid with component spacing multiples. Prefer calm vertical rhythm and larger gaps between major sections to avoid clutter.
- Responsive: Mobile-first; scale typographic sizes and stack content. Maintain touch-friendly hit areas (min 44×44px).

## 6. Tokens & Implementation Notes

Source tokens are defined in src/index.css as CSS variables (light + .dark). Key variables: --primary, --background, --foreground, --card, --muted, --destructive, --ring, --radius, --glow-accent.

When authoring new screens or components, reference these semantic tokens rather than hard-coded hex values. For Stitch generation prompts, prefer natural-language descriptions that mention the token role (e.g., "Primary CTA uses the vibrant purple accent with subtle glow and 0.5rem corner radius").

---

Generated from repository tokens in src/index.css and index.html. For deeper visual guidance, use the CSS variables above as canonical values.