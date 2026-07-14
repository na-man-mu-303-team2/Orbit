import { z } from "zod";

export const deckCompositionIdSchema = z.enum([
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
  "timeline",
  "diagram-hub",
  "cta-closing"
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
