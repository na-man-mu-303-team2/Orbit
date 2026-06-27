import { z } from "zod";

export const animationTypeSchema = z.enum([
  "fade-in",
  "fade-out",
  "appear",
  "slide-in",
  "none"
]);

export const animationSchema = z.object({
  animationId: z.string().min(1),
  elementId: z.string().min(1).optional(),
  type: animationTypeSchema,
  order: z.number().int().nonnegative()
});

export type DeckAnimation = z.infer<typeof animationSchema>;
