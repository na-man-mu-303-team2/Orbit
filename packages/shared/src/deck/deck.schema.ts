import { z } from "zod";

import { animationSchema } from "./animation.schema";
import { deckElementSchema } from "./slide-object.schema";

export const keywordSchema = z.object({
  keywordId: z.string().min(1),
  text: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
  abbreviations: z.array(z.string()).default([])
});

export const slideSchema = z.object({
  slideId: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().default(""),
  thumbnailUrl: z.string().default(""),
  speakerNotes: z.string().default(""),
  elements: z.array(deckElementSchema).default([]),
  keywords: z.array(keywordSchema).default([]),
  animations: z.array(animationSchema).default([])
});

export const deckSchema = z.object({
  deckId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  version: z.number().int().positive(),
  slides: z.array(slideSchema)
});

export type Deck = z.infer<typeof deckSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type Keyword = z.infer<typeof keywordSchema>;
