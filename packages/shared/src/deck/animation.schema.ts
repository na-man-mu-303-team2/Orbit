import { z } from "zod";

import {
  deckAnimationIdSchema,
  deckElementIdSchema,
  deckKeywordIdSchema
} from "./id.schema";

export const animationTypeSchema = z.enum([
  "appear",
  "disappear",
  "fade-in",
  "fade-out",
  "zoom-in",
  "zoom-out",
  "rotate"
]);

export const animationEasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out"
]);

export const animationTriggerSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("keyword"),
    keywordId: deckKeywordIdSchema
  })
]);

export const animationSchema = z.object({
  animationId: deckAnimationIdSchema,
  elementId: deckElementIdSchema,
  type: animationTypeSchema,
  order: z.number().int().positive(),
  durationMs: z.number().int().positive().default(400),
  delayMs: z.number().int().nonnegative().default(0),
  easing: animationEasingSchema.default("ease-out"),
  trigger: animationTriggerSchema.optional()
});

export type DeckAnimationType = z.infer<typeof animationTypeSchema>;
export type DeckAnimationEasing = z.infer<typeof animationEasingSchema>;
export type DeckAnimationTrigger = z.infer<typeof animationTriggerSchema>;
export type DeckAnimation = z.infer<typeof animationSchema>;
