# Design System: Aether Arena

## 1. Visual Theme & Atmosphere
A high-performance, clinical yet visceral comparison environment for LLM models. The interface is "Cockpit Dense" (8/10) for utility but maintains "Art Gallery Airy" (3/10) spacing for clarity. It leverages absolute OLED blacks, sharp calibrated accents, and hardware-inspired textures. The motion is cinematic and weighted, using spring physics to communicate importance.

## 2. Color Palette & Roles
- **OLED Void** (#000000) — Primary background for maximum contrast.
- **Surface Deep** (#09090B) — Primary card and modal fill.
- **Surface Elevated** (#18181B) — Hover states and nested containers.
- **Aether Cyan** (#22D3EE) — Singular accent for active states, focal points, and progress indicators. (Saturation 72%).
- **Ghost Text** (#F8FAFC) — Primary information, high readability.
- **Muted Zinc** (#71717A) — Secondary metadata, timestamps, and inactive states.
- **Structure Border** (rgba(255, 255, 255, 0.06)) — 1px hair-line dividers and structural boundaries.

## 3. Typography Rules
- **Display:** Geist — Track-tight (-0.02em), heavy weight (600+) for headlines, light weight (300) for sub-headers.
- **Body:** Geist — Leading 1.6, max 65ch per line. Use weight over size for hierarchy.
- **Mono:** JetBrains Mono — For all model identifiers, tokens, response metrics, and code blocks.
- **Banned:** Inter, Generic Sans-Serif, Generic Serif.

## 4. Component Stylings
* **Buttons:** Tactile, sharp corners (0.25rem). Accent fill for primary, border-only for secondary. -1px Y-axis translate on click.
* **Cards:** Minimal rounding (0.5rem). No shadows. Hierarchy is established through background value shifts (Surface Deep vs Surface Elevated) and hair-line borders.
* **Inputs:** Integrated "Prompt Bar" style. Floating glass effect with `backdrop-filter: blur(20px)`.
* **Loaders:** Perpetual "Scan-line" shimmer or typewriter cursor. No circular spinners.

## 5. Layout Principles
- **Asymmetric Sidebar**: Fixed left navigation at 240px.
- **Masonry Arena**: The central dashboard uses an asymmetric grid for model comparison cards.
- **No Overlapping**: Every metric and text block occupies its own clean spatial zone.
- **High Density**: Metrics are presented in monospace with clear labels above values.

## 6. Motion & Interaction
- **Spring Physics**: `stiffness: 120, damping: 25`.
- **Waterfall Cascade**: Model cards reveal sequentially when results stream in.
- **Perpetual Micro-Loop**: Active model nodes have a subtle "breathing" cyan glow (opacity 0.1 to 0.3).

## 7. Anti-Patterns (Banned)
- No emojis.
- No purple or "AI Neon" gradients.
- No rounded "pill" buttons (use sharp/tech corners).
- No generic names (use specific model IDs).
- No fabricated data — use clear `[pending]` or `[token/s]` labels.
- No 3-column equal grids — use 2:1 or staggered layouts.
