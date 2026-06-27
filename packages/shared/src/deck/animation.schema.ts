import { z } from "zod";

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

export const animationSchema = z.object({
  animationId: z.string().min(1),
  elementId: z.string().min(1),
  type: animationTypeSchema,
  order: z.number().int().positive(),
  durationMs: z.number().int().positive().default(400),
  delayMs: z.number().int().nonnegative().default(0),
  easing: animationEasingSchema.default("ease-out")
});

export type DeckAnimationType = z.infer<typeof animationTypeSchema>;
export type DeckAnimationEasing = z.infer<typeof animationEasingSchema>;
export type DeckAnimation = z.infer<typeof animationSchema>;
