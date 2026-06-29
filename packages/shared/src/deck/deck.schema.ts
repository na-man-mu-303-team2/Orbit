import { z } from "zod";

import { animationSchema } from "./animation.schema";
import {
  deckIdSchema,
  deckKeywordIdSchema,
  deckSlideIdSchema
} from "./id.schema";
import { deckElementSchema } from "./slide-object.schema";
import { themeColorSchema, themeSchema } from "./theme.schema";

export const deckSourceTypeSchema = z.enum(["manual", "import", "ai"]);

export const aiDeckAudienceSchema = z.enum([
  "general",
  "executive",
  "technical",
  "sales"
]);

export const aiDeckPurposeSchema = z.enum([
  "inform",
  "persuade",
  "teach",
  "report"
]);

export const aiDeckToneSchema = z.enum([
  "professional",
  "friendly",
  "confident",
  "concise"
]);

export const deckCreatedFromReferenceSchema = z.object({
  fileId: z.string().min(1)
});

export const deckCreatedFromSchema = z.object({
  topic: z.string().min(1),
  references: z.array(deckCreatedFromReferenceSchema).default([])
});

export const deckMetadataSchema = z.object({
  language: z.literal("ko").default("ko"),
  locale: z.literal("ko-KR").default("ko-KR"),
  sourceType: deckSourceTypeSchema.optional(),
  generatedBy: z.literal("ai").optional(),
  audience: aiDeckAudienceSchema.optional(),
  purpose: aiDeckPurposeSchema.optional(),
  tone: aiDeckToneSchema.optional(),
  createdFrom: deckCreatedFromSchema.optional()
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

export const keywordTermSchema = z.string().trim().min(1);

export const keywordSchema = z.object({
  keywordId: deckKeywordIdSchema,
  text: keywordTermSchema,
  synonyms: z.array(keywordTermSchema).default([]),
  abbreviations: z.array(keywordTermSchema).default([])
});

export const slideKeywordsSchema = z
  .array(keywordSchema)
  .superRefine((keywords, ctx) => {
    const keywordTexts = new Set<string>();
    const synonyms = new Set<string>();
    const abbreviations = new Set<string>();

    keywords.forEach((keyword, keywordIndex) => {
      requireUniqueKeywordTerm(ctx, keywordTexts, keyword.text, [
        keywordIndex,
        "text"
      ]);

      keyword.synonyms.forEach((synonym, synonymIndex) => {
        requireUniqueKeywordTerm(ctx, synonyms, synonym, [
          keywordIndex,
          "synonyms",
          synonymIndex
        ]);
      });

      keyword.abbreviations.forEach((abbreviation, abbreviationIndex) => {
        requireUniqueKeywordTerm(ctx, abbreviations, abbreviation, [
          keywordIndex,
          "abbreviations",
          abbreviationIndex
        ]);
      });
    });
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

export const slideSourceEvidenceSchema = z.object({
  fileId: z.string().min(1),
  quote: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  confidence: z.number().finite().min(0).max(1).default(0.5)
});

export const slideAiNotesSchema = z
  .object({
    emphasisPoints: z.array(z.string().min(1)).default([]),
    sourceEvidence: z.array(slideSourceEvidenceSchema).default([])
  })
  .default({});

export const slideSchema = z.object({
  slideId: deckSlideIdSchema,
  order: slideOrderSchema,
  title: z.string().default(""),
  thumbnailUrl: z.string().default(""),
  style: slideStyleSchema,
  speakerNotes: z.string().default(""),
  elements: z.array(deckElementSchema).default([]),
  keywords: slideKeywordsSchema.default([]),
  animations: z.array(animationSchema).default([]),
  aiNotes: slideAiNotesSchema.optional()
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
export type DeckSourceType = z.infer<typeof deckSourceTypeSchema>;
export type AiDeckAudience = z.infer<typeof aiDeckAudienceSchema>;
export type AiDeckPurpose = z.infer<typeof aiDeckPurposeSchema>;
export type AiDeckTone = z.infer<typeof aiDeckToneSchema>;
export type DeckCreatedFrom = z.infer<typeof deckCreatedFromSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type SlideLayout = z.infer<typeof slideLayoutSchema>;
export type SlideStyle = z.infer<typeof slideStyleSchema>;
export type SlideBackgroundImage = z.infer<typeof slideBackgroundImageSchema>;
export type SlideBackgroundImageFit = z.infer<
  typeof slideBackgroundImageFitSchema
>;
export type SlideSourceEvidence = z.infer<typeof slideSourceEvidenceSchema>;
export type SlideAiNotes = z.infer<typeof slideAiNotesSchema>;
export type KeywordTerm = z.infer<typeof keywordTermSchema>;
export type Keyword = z.infer<typeof keywordSchema>;

function requireUniqueKeywordTerm(
  ctx: z.RefinementCtx,
  seen: Set<string>,
  rawValue: string,
  path: Array<string | number>
): void {
  const value = rawValue.toLocaleLowerCase("ko-KR");

  if (seen.has(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "keyword terms must be unique within the same slide"
    });
    return;
  }

  seen.add(value);
}
