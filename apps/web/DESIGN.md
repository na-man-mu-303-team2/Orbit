---
name: Redesign System
colors:
  surface: '#ffffff'
  surface-dim: '#f2f2f4'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f8fa'
  surface-container: '#f1f1f4'
  surface-container-high: '#e9e9ed'
  surface-container-highest: '#e0e0e6'
  on-surface: '#111114'
  on-surface-variant: '#55555f'
  inverse-surface: '#1c1c20'
  inverse-on-surface: '#f5f5f7'
  outline: '#8c8c96'
  outline-variant: '#d6d6dc'
  surface-tint: '#0090ff'
  primary: '#0090ff'
  on-primary: '#ffffff'
  primary-container: '#e0f3ff'
  on-primary-container: '#004a75'
  inverse-primary: '#8dd4ff'
  secondary: '#8b3dff'
  on-secondary: '#ffffff'
  secondary-container: '#f1e6ff'
  on-secondary-container: '#4a1b91'
  tertiary: '#ff2d9e'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffe0f0'
  on-tertiary-container: '#8a0055'
  error: '#d3283f'
  on-error: '#ffffff'
  error-container: '#ffe0e0'
  on-error-container: '#7a0010'
  primary-fixed: '#e0f3ff'
  primary-fixed-dim: '#8dd4ff'
  on-primary-fixed: '#001c2e'
  on-primary-fixed-variant: '#004a75'
  secondary-fixed: '#f1e6ff'
  secondary-fixed-dim: '#d8b9ff'
  on-secondary-fixed: '#2a0060'
  on-secondary-fixed-variant: '#5b1fb0'
  tertiary-fixed: '#ffe0f0'
  tertiary-fixed-dim: '#ff86d9'
  on-tertiary-fixed: '#5c0040'
  on-tertiary-fixed-variant: '#8a0055'
  background: '#ffffff'
  on-background: '#111114'
  surface-variant: '#e9e9ed'
typography:
  display-lg:
    fontFamily: Pretendard
    fontSize: 64px
    fontWeight: '800'
    lineHeight: 72px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Pretendard
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Pretendard
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  body-md:
    fontFamily: Pretendard
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-sm:
    fontFamily: Pretendard
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  gutter: 24px
  margin: 32px
---

## Brand & Style

This design system is engineered for high-end creative tools, demanding an atmosphere of high-energy precision and professional intensity. The brand personality is "Electric Sophistication"—it is unapologetically bold, highly technical, and visually stimulating.

The design style is a hybrid of **Vivid Minimalism** and **Glassmorphism**. It utilizes vast areas of crisp, near-white space to allow hyper-saturated neon elements to "glow" without visual clutter. The aesthetic response should be one of immediate focus and creative empowerment, where the UI feels like a high-performance instrument. Expect crisp edges, vibrant accents, and a sense of depth created through luminous light-leaks and structural transparency, rendered against bright, clean surfaces rather than a dark canvas.

## Colors

The palette centers on a "Vivid Neon" core, optimized for maximum contrast and luminance against a bright white canvas.

- **Primary (Electric Blue):** Used for primary actions and active states. It should feel like a light source.
- **Secondary (Vivid Purple):** Used for creative features, multi-select states, and logic-based UI elements.
- **Tertiary (Neon Pink):** Reserved for highlights, critical notifications, or secondary creative tools to provide high-contrast tension against the blue.
- **Neutral/Surface:** The background is a pure white (#FFFFFF) to keep the canvas clean, while surfaces use a barely-tinted off-white (#F8F8FA) to maintain structural hierarchy without competing with the neon accents.

Contrast ratios must exceed WCAG AAA standards for all functional text to maintain the "crisp" professional requirement.

## Typography

Typography in this design system prioritizes legibility and technical rigor.

**Pretendard** is used across every text role—display, headline, body, and label—for its exceptional clarity on high-resolution displays and its wide variable-weight range, which is enough on its own to carry the visual hierarchy without mixing typefaces.

For large displays, use tight letter-spacing on headlines to create a "locked-in" editorial look. Small labels should always use slightly increased letter-spacing and uppercase styling for maximum scanability in dense interfaces.

## Layout & Spacing

The design system utilizes a **Fixed Grid** philosophy for desktop layouts to mimic a structured workbench, transitioning to a **Fluid Grid** for tablet and mobile.

- **Desktop:** 12-column grid, 1200px max-width, 24px gutters.
- **Tablet:** 8-column grid, fluid width, 20px gutters.
- **Mobile:** 4-column grid, fluid width, 16px gutters.

Spacing follows a strict 4px base-unit scale. Components should favor generous internal padding (16px+) to offset the visual density of the high-saturation colors, ensuring the interface feels "breathable" despite its intensity. Layouts are strictly aligned to the grid to maintain a professional, engineered appearance.

## Elevation & Depth

Elevation is communicated through **Tonal Layering** and **Luminous Outlines** rather than traditional shadows.

1.  **Base:** Pure white (#FFFFFF).
2.  **Surface:** Barely-lifted off-white (#F8F8FA).
3.  **Overlay:** Used for modals or menus (#FFFFFF with a stronger 1px border and shadow to separate it from the base layer).

To create depth, use a 1px inner-border (stroke) on containers with the `outline-variant` color (#D6D6DC) to define edges cleanly against the white canvas. For high-priority active elements, apply a "Bloom" effect: a soft, outer glow using the element's primary color with 20% opacity and a 12px blur. Because the canvas is bright, this glow reads as a colored halo rather than a light source in darkness—still futuristic, but tuned for a light surface.

## Shapes

To maintain a professional and "technical tool" aesthetic, the design system utilizes **Soft** roundedness.

- **Standard Elements (Buttons, Inputs):** 0.25rem (4px) corner radius. This keeps the UI feeling precise and structured.
- **Containers (Cards, Modals):** 0.5rem (8px) corner radius.
- **Large Panels:** 0.75rem (12px) corner radius.

Avoid fully rounded or pill-shaped buttons unless used for specialized floating action buttons. The goal is a "machined" look—deliberate, clean, and sharp.

## Components

- **Buttons:** Primary buttons use a solid Electric Blue fill with white text for maximum contrast. Secondary buttons use a 1px border of the primary color with no fill and primary-colored text.
- **Inputs:** Off-white backgrounds (#F8F8FA) with a 1px `outline-variant` border that switches to the primary color and gains a soft glow when focused. Use Pretendard for input text.
- **Chips/Tags:** Small, high-contrast badges. Use Tertiary Pink or Secondary Purple container backgrounds (10% tint) with full-opacity borders of the same color.
- **Lists:** Rows are separated by 1px `outline-variant` borders. Hover states should trigger a subtle background lift into `surface-container`.
- **Cards:** No heavy shadows. Cards are defined by their 1px `outline-variant` border and a slightly lighter surface color than the background; active/emphasized cards may add the Bloom glow.
- **Tooltips:** High-contrast dark (`inverse-surface`) backgrounds with white text and a 1px Electric Blue top-border to indicate the "active" source of information.
