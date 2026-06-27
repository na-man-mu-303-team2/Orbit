import { z } from "zod";

import { animationSchema } from "./animation.schema";

export const deckElementTypeSchema = z.enum([
  "text",
  "image",
  "shape",
  "chart",
  "video"
]);

export const deckElementSchema = z.object({
  elementId: z.string().min(1),
  type: deckElementTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  props: z.record(z.unknown()).default({}),
  animations: z.array(animationSchema).default([])
});

export type DeckElement = z.infer<typeof deckElementSchema>;
