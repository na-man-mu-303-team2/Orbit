import { z } from "zod";

import { animationSchema } from "./animation.schema";
import {
  deckIdSchema,
  deckKeywordIdSchema,
  deckSlideIdSchema
} from "./id.schema";
import { deckElementSchema } from "./slide-object.schema";
import { themeColorSchema, themeSchema } from "./theme.schema";

export const deckMetadataSchema = z.object({
  language: z.literal("ko").default("ko"),
  locale: z.literal("ko-KR").default("ko-KR")
});

export const wideDeckCanvasSchema = z.object({
  preset: z.literal("wide-16-9"),
  width: z.literal(1920),
  height: z.literal(1080),
  aspectRatio: z.literal("16:9")
});

export const standardDeckCanvasSchema = z.object({
  preset: z.literal("standard-4-3"),
  width: z.literal(1024),
  height: z.literal(768),
  aspectRatio: z.literal("4:3")
});

export const deckCanvasSchema = z.discriminatedUnion("preset", [
  wideDeckCanvasSchema,
  standardDeckCanvasSchema
]);

export const keywordTextSchema = z.string().trim().min(1);
export const keywordTermSchema = z.string().trim().min(1);

export const keywordSchema = z.object({
  keywordId: deckKeywordIdSchema,
  text: keywordTextSchema,
  synonyms: z.array(keywordTermSchema).default([]),
  abbreviations: z.array(keywordTermSchema).default([])
});

export const slideOrderSchema = z.number().int().positive();

export const slideLayoutSchema = z.enum([
  "title",
  "title-content",
  "section",
  "two-column",
  "image-left",
  "image-right",
  "chart-focus",
  "quote",
  "closing"
]);

export const slideBackgroundImageFitSchema = z.enum([
  "contain",
  "cover",
  "stretch"
]);

export const slideBackgroundImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().default(""),
  fit: slideBackgroundImageFitSchema.default("cover"),
  opacity: z.number().finite().min(0).max(1).default(1)
});

export const slideStyleSchema = z
  .object({
    layout: slideLayoutSchema.optional(),
    fontFamily: z.string().min(1).optional(),
    backgroundColor: themeColorSchema.optional(),
    textColor: themeColorSchema.optional(),
    accentColor: themeColorSchema.optional(),
    backgroundImage: slideBackgroundImageSchema.optional()
  })
  .default({});

export const slideSchema = z
  .object({
    slideId: deckSlideIdSchema,
    order: slideOrderSchema,
    title: z.string().default(""),
    thumbnailUrl: z.string().default(""),
    style: slideStyleSchema,
    speakerNotes: z.string().default(""),
    elements: z.array(deckElementSchema).default([]),
    keywords: z.array(keywordSchema).default([]),
    animations: z.array(animationSchema).default([])
  })
  .superRefine((slide, ctx) => {
    const keywordTexts = new Set<string>();

    slide.keywords.forEach((keyword, index) => {
      const text = keyword.text.toLocaleLowerCase("ko-KR");

      if (keywordTexts.has(text)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["keywords", index, "text"],
          message: "keyword text must be unique within a slide"
        });
        return;
      }

      keywordTexts.add(text);
    });
  });

export const deckSchema = z.object({
  deckId: deckIdSchema,
  projectId: z.string().min(1),
  title: z.string().min(1),
  version: z.number().int().positive(),
  metadata: deckMetadataSchema.default({}),
  canvas: deckCanvasSchema,
  theme: themeSchema.default({}),
  slides: z.array(slideSchema).min(1)
});

export type Deck = z.infer<typeof deckSchema>;
export type DeckCanvas = z.infer<typeof deckCanvasSchema>;
export type DeckMetadata = z.infer<typeof deckMetadataSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type SlideLayout = z.infer<typeof slideLayoutSchema>;
export type SlideStyle = z.infer<typeof slideStyleSchema>;
export type SlideBackgroundImage = z.infer<typeof slideBackgroundImageSchema>;
export type SlideBackgroundImageFit = z.infer<
  typeof slideBackgroundImageFitSchema
>;
export type Keyword = z.infer<typeof keywordSchema>;
