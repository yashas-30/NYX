---
version: 1.0
name: Premium-Minimalist-True-Black
description: A high-contrast, premium true-black minimalist design system. The aesthetic anchors on absolute black (#000000) backgrounds with crisp white typography and muted gray secondary elements. It rejects shadows and gradients, relying instead on precision 1px borders, generous whitespace, and stark contrast to establish visual hierarchy.

colors:
  primary: "#ffffff"
  primary-active: "#e4e4e7"
  primary-disabled: "#3f3f46"
  ink: "#ffffff"
  body: "#ffffff"
  body-strong: "#ffffff"
  muted: "#a1a1aa"
  muted-soft: "#71717a"
  hairline: "rgba(161, 161, 170, 0.2)"
  hairline-strong: "rgba(161, 161, 170, 0.4)"
  canvas: "#000000"
  surface-card: "#000000"
  surface-elevated: "#000000"
  on-primary: "#000000"
  on-dark: "#ffffff"
  on-dark-soft: "#a1a1aa"
  accent-warm: "#8e8e93"
  success: "#10b981"
  warning: "#f59e0b"
  error: "#ef4444"

typography:
  display-xl:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -1.5px
  display-lg:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -1px
  display-md:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.5px
  display-sm:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.3px
  title-lg:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.02em
  title-md:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: -0.01em
  title-sm:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  caption:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  code:
    fontFamily: "IBM Plex Mono, Geist Mono, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  button:
    fontFamily: "Inter, Geist Sans, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 20px
    height: 40px
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-disabled:
    backgroundColor: "{colors.primary-disabled}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 20px
    height: 40px
  text-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 10px 14px
    height: 40px
  text-input-focused:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1px solid {colors.primary}"
    rounded: "{rounded.md}"
  feature-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.title-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  code-window-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: 24px
  badge-pill:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    border: "1px solid {colors.hairline-strong}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
---

## Overview

The application utilizes a **Premium Minimalist True Black** interface. This system is heavily optimized for maximum contrast, ocular comfort in low light, and a high-end "luxury tech" feel. 

By removing almost all background color variations, the UI relies strictly on **white typography, muted gray accents, and translucent 1px borders** to communicate structure.

**Key Characteristics:**
- Absolute True Black (`#000000`) acts as the infinite canvas and the background for all cards and elevated surfaces.
- Depth is achieved via 1px translucent white borders (`rgba(161, 161, 170, 0.2)`), *never* via drop shadows. 
- Typography is geometric and sharp. `Inter` or `Geist Sans` drives the entire UI, heavily utilizing negative letter-spacing for large headings to increase cohesion.
- Pure White (`#FFFFFF`) is used for primary text and critical elements. Muted Gray (`#A1A1AA`) is strictly enforced for secondary text, metadata, and borders to prevent halation and eye strain.
- Color accents are exceptionally rare. 

## Colors

### The Strict 3-Color Rule
- **True Black (#000000):** The absolute background. Creates an infinite-edge effect on OLED screens.
- **Crisp White (#FFFFFF):** Primary text, major headlines, and high-impact buttons.
- **Muted Gray (#A1A1AA):** Secondary text, subtle dividers, borders, and disabled states.

### Semantic Tones
- Semantic colors (success, warning, error) are used only when absolutely necessary (e.g. form validation, critical system status). They should be slightly desaturated to prevent them from vibrating aggressively against the true black background.

## Typography

Typography acts as the primary architectural element of the page since structural background colors have been removed. 

- **Primary UI:** `Inter` or `Geist Sans` for everything.
- **Code/Metadata:** `IBM Plex Mono` or `Geist Mono` for technical labels, IDs, and code blocks.
- **Tracking:** Headings require tight tracking (`-0.02em` to `-0.05em`). This binds words together tightly, creating a sharp, engineered aesthetic.

## Layout & Depth

### The No-Shadow Rule
Because the canvas is absolute black, drop shadows are mathematically impossible and must never be used. 

**How to create depth:**
Instead of lifting an element via a shadow, you "cut it out" of the black canvas using a 1px border. 
- Level 0: The base `#000000` canvas.
- Level 1 (Cards): A `#000000` surface outlined by a `rgba(161, 161, 170, 0.2)` border.
- Level 2 (Modals): A `#000000` surface outlined by a stronger `rgba(161, 161, 170, 0.4)` border.

### Spacing
Use generous whitespace. Because there are no colored backgrounds to group elements, the Gestalt principle of proximity is the only way to indicate that elements belong together.

## Do's and Don'ts

### Do
- Anchor every surface, from the background to floating modals, in `#000000`.
- Rely entirely on 1px borders and typography to establish hierarchy.
- Use Muted Gray (`#A1A1AA`) for any text longer than two sentences to drastically reduce eye fatigue. 
- Embrace negative space.

### Don't
- Don't use dark grays (e.g. `#1A1A1A`) for surface backgrounds. Stay true to the `#000000` monochrome rule.
- Don't use drop shadows. They look muddy and dirty on black backgrounds.
- Don't use gradients. The brand is built on stark, flat contrast.
- Don't use pure white `#FFFFFF` for large paragraphs of text.
