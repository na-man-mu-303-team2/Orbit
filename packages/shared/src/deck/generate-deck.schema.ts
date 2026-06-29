import { z } from "zod";

import {
  aiDeckAudienceSchema,
  aiDeckPurposeSchema,
  aiDeckToneSchema,
  deckSchema
} from "./deck.schema";
import { deckIdSchema } from "./id.schema";

export const generateDeckTemplateSchema = z.enum([
  "default",
  "pitch",
  "report",
  "lesson"
]);

export const generateDeckReferenceSchema = z.object({
  fileId: z.string().min(1)
});

export const generateDeckReferenceKeywordSchema = z.object({
  text: z.string().trim().min(1)
});

export const generateDeckMetadataSchema = z
  .object({
    audience: aiDeckAudienceSchema.default("general"),
    purpose: aiDeckPurposeSchema.default("inform"),
    tone: aiDeckToneSchema.default("professional")
  })
  .default({});

export const generateDeckDesignSchema = z
  .object({
    visualRhythm: z
      .enum(["auto", "clean", "editorial", "bold", "technical"])
      .default("auto"),
    densityTarget: z.enum(["low", "medium", "high"]).default("medium"),
    mediaPolicy: z
      .enum(["avoid", "balanced", "placeholder-ok"])
      .default("balanced"),
    layoutDiversity: z.enum(["stable", "varied"]).default("stable")
  })
  .default({});

export const generateDeckSlideCountRangeSchema = z
  .object({
    min: z.number().int().min(1).max(20).default(5),
    max: z.number().int().min(1).max(20).default(8)
  })
  .default({})
  .superRefine((range, ctx) => {
    if (range.min > range.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min"],
        message: "min must be less than or equal to max"
      });
    }
  });

export const generateDeckRequestSchema = z.object({
  topic: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  targetDurationMinutes: z.number().int().min(1).max(120).default(10),
  slideCountRange: generateDeckSlideCountRangeSchema,
  template: generateDeckTemplateSchema.default("default"),
  metadata: generateDeckMetadataSchema,
  design: generateDeckDesignSchema,
  references: z.array(generateDeckReferenceSchema).default([]),
  referenceKeywords: z.array(generateDeckReferenceKeywordSchema).default([])
});

export const generateDeckValidationIssueSchema = z.object({
  scope: z.enum(["deck", "slide", "element"]),
  path: z.string().default(""),
  message: z.string().min(1)
});

export const generateDeckValidationSchema = z.object({
  passed: z.boolean(),
  layoutIssues: z.array(generateDeckValidationIssueSchema).default([]),
  contentIssues: z.array(generateDeckValidationIssueSchema).default([]),
  designIssues: z.array(generateDeckValidationIssueSchema).default([]),
  presentationIssues: z.array(generateDeckValidationIssueSchema).default([])
});

export const generateDeckResponseSchema = z.object({
  deck: deckSchema,
  warnings: z.array(z.string()).default([]),
  validation: generateDeckValidationSchema
});

export const generateDeckJobResultSchema = generateDeckResponseSchema
  .extend({
    deckId: deckIdSchema
  })
  .superRefine((result, ctx) => {
    if (result.deckId !== result.deck.deckId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deckId"],
        message: "deckId must match deck.deckId"
      });
    }
  });

export type GenerateDeckTemplate = z.infer<typeof generateDeckTemplateSchema>;
export type GenerateDeckReference = z.infer<typeof generateDeckReferenceSchema>;
export type GenerateDeckReferenceKeyword = z.infer<
  typeof generateDeckReferenceKeywordSchema
>;
export type GenerateDeckMetadata = z.infer<typeof generateDeckMetadataSchema>;
export type GenerateDeckDesign = z.infer<typeof generateDeckDesignSchema>;
export type GenerateDeckSlideCountRange = z.infer<
  typeof generateDeckSlideCountRangeSchema
>;
export type GenerateDeckRequest = z.infer<typeof generateDeckRequestSchema>;
export type GenerateDeckValidationIssue = z.infer<
  typeof generateDeckValidationIssueSchema
>;
export type GenerateDeckValidation = z.infer<typeof generateDeckValidationSchema>;
export type GenerateDeckResponse = z.infer<typeof generateDeckResponseSchema>;
export type GenerateDeckJobResult = z.infer<typeof generateDeckJobResultSchema>;
