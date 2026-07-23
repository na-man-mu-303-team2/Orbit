import { z } from "zod";

export const deckCompositionIdSchema = z.enum([
  "cover-classic-corporate",
  "cover-visual-impact",
  "cover-immersive-background",
  "cover-research-author",
  "cover-structured-report",
  "cover-modern-high-tech",
  "hero-split",
  "hero-full-bleed",
  "minimal-cover",
  "statement-poster",
  "editorial-split",
  "metric-poster",
  "kpi-strip-evidence",
  "image-evidence",
  "feature-comparison",
  "process-horizontal",
  "process-vertical-rail",
  "timeline",
  "diagram-hub",
  "diagram-orbit",
  "bento-focus",
  "editorial-media-band",
  "cta-closing",
  "agenda-numbered-list",
  "agenda-two-column",
  "agenda-chapter-grid",
  "agenda-vertical-rail",
  "agenda-editorial-index",
  "closing-centered-minimal",
  "closing-editorial-frame",
  "closing-split-accent",
  "closing-vertical-mark",
  "closing-soft-panel"
]);

export const deckCompositionBackgroundModeSchema = z.enum([
  "light",
  "dark",
  "image"
]);

export type DeckCompositionId = z.infer<typeof deckCompositionIdSchema>;
export type DeckCompositionBackgroundMode = z.infer<
  typeof deckCompositionBackgroundModeSchema
>;
