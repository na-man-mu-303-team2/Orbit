import { z } from "zod";

import {
  aiDeckAudienceSchema,
  aiDeckPurposeSchema,
  aiDeckToneSchema,
  deckSchema
} from "./deck.schema";
import { deckIdSchema } from "./id.schema";
import { templateBlueprintIdSchema } from "./template-blueprint.schema";
import { themeColorSchema } from "./theme.schema";

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

export const generateDeckReferenceContextSchema = z.object({
  fileId: z.string().min(1),
  title: z.string().trim().default(""),
  content: z.string().trim().min(1)
});

export const generateDeckMetadataSchema = z
  .object({
    audience: aiDeckAudienceSchema.default("general"),
    purpose: aiDeckPurposeSchema.default("inform"),
    tone: aiDeckToneSchema.default("professional")
  })
  .default({});

export const generateDeckReferencePolicySchema = z.enum([
  "topic-only",
  "references-first",
  "references-only"
]);

export const generateDeckGenerationModeSchema = z
  .enum(["legacy", "design-pack"])
  .default("legacy");

export const generateDeckForbiddenStyleSchema = z.enum(["gradient", "pastel"]);

export const generateDeckDesignConstraintsSchema = z.object({
  canvasBackground: z.enum(["auto", "white"]).default("auto"),
  forbiddenStyles: z.array(generateDeckForbiddenStyleSchema).default([])
});

export const generateDeckColorIntentSchema = z.object({
  mood: z
    .enum([
      "auto",
      "calm",
      "trustworthy",
      "relaxed",
      "energetic",
      "premium",
      "creative"
    ])
    .default("auto"),
  trustLevel: z.enum(["low", "medium", "high"]).default("medium"),
  energyLevel: z.enum(["low", "medium", "high"]).default("medium"),
  formality: z.enum(["casual", "professional", "formal"]).default("professional"),
  preferredHue: z
    .enum([
      "auto",
      "blue",
      "teal",
      "green",
      "violet",
      "pink",
      "orange",
      "red",
      "yellow",
      "slate",
      "monochrome"
    ])
    .default("auto"),
  backgroundPreference: z.enum(["auto", "white", "light", "dark"]).default("auto"),
  forbiddenStyles: z.array(generateDeckForbiddenStyleSchema).default([])
});

export const generateDeckBriefSchema = z
  .object({
    presentationContext: z.string().trim().optional(),
    audienceText: z.string().trim().optional(),
    presentationType: z.string().trim().optional(),
    successCriteria: z.string().trim().optional(),
    durationMinutes: z.number().int().min(1).max(120).optional(),
    referencePolicy: generateDeckReferencePolicySchema.default("topic-only")
  })
  .default({});

export const generateDeckPaletteOverrideSchema = z
  .object({
    primary: themeColorSchema.optional(),
    secondary: themeColorSchema.optional(),
    background: themeColorSchema.optional(),
    surface: themeColorSchema.optional(),
    muted: themeColorSchema.optional(),
    border: themeColorSchema.optional(),
    text: themeColorSchema.optional(),
    accentColor: themeColorSchema.optional()
  })
  .partial();

export const generateDeckDesignSchema = z
  .object({
    profile: z
      .enum([
        "executive-report",
        "startup-pitch",
        "editorial",
        "technical",
        "training"
      ])
      .optional(),
    stylePackId: z.string().trim().min(1).optional(),
    slidePresetId: z.string().trim().min(1).optional(),
    visualRhythm: z
      .enum(["auto", "clean", "editorial", "bold", "technical"])
      .default("auto"),
    densityTarget: z.enum(["low", "medium", "high"]).default("medium"),
    mediaPolicy: z
      .enum(["avoid", "balanced", "placeholder-ok"])
      .default("balanced"),
    layoutDiversity: z.enum(["stable", "varied"]).default("stable"),
    colorIntent: generateDeckColorIntentSchema.optional(),
    constraints: generateDeckDesignConstraintsSchema.optional(),
    paletteOverride: generateDeckPaletteOverrideSchema.optional()
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
  generationMode: generateDeckGenerationModeSchema,
  topic: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  designPrompt: z.string().trim().optional(),
  brief: generateDeckBriefSchema,
  targetDurationMinutes: z.number().int().min(1).max(120).default(10),
  slideCountRange: generateDeckSlideCountRangeSchema,
  template: generateDeckTemplateSchema.default("default"),
  metadata: generateDeckMetadataSchema,
  design: generateDeckDesignSchema,
  references: z.array(generateDeckReferenceSchema).default([]),
  designReferences: z.array(generateDeckReferenceSchema).default([]),
  templateBlueprintId: templateBlueprintIdSchema.optional(),
  referenceKeywords: z.array(generateDeckReferenceKeywordSchema).default([]),
  referenceContext: z.array(generateDeckReferenceContextSchema).default([])
});

export const deckColorOptionRequestSchema = z.object({
  topic: z.string().trim().min(1),
  colorMood: z.string().trim().default(""),
  stylePackId: z.string().trim().min(1).default("brandlogy-modern"),
  colorIntent: generateDeckColorIntentSchema.optional(),
  constraints: generateDeckDesignConstraintsSchema.optional()
});

export const deckColorOptionSchema = z.object({
  optionId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  palette: generateDeckPaletteOverrideSchema,
  rationale: z.string().trim().default("")
});

export const deckColorOptionsResponseSchema = z.object({
  options: z.array(deckColorOptionSchema).length(3)
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

export const templateSelectionItemSchema = z.object({
  generatedOrder: z.number().int().positive(),
  sourceSlideIndex: z.number().int().positive(),
  selectionReason: z.string().trim().min(1).optional()
});

export const generateDeckResponseSchema = z.object({
  deck: deckSchema,
  templateSelection: z.array(templateSelectionItemSchema).optional(),
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
export type GenerateDeckReferenceContext = z.infer<
  typeof generateDeckReferenceContextSchema
>;
export type GenerateDeckMetadata = z.infer<typeof generateDeckMetadataSchema>;
export type GenerateDeckReferencePolicy = z.infer<
  typeof generateDeckReferencePolicySchema
>;
export type GenerateDeckGenerationMode = z.infer<
  typeof generateDeckGenerationModeSchema
>;
export type GenerateDeckForbiddenStyle = z.infer<
  typeof generateDeckForbiddenStyleSchema
>;
export type GenerateDeckDesignConstraints = z.infer<
  typeof generateDeckDesignConstraintsSchema
>;
export type GenerateDeckColorIntent = z.infer<
  typeof generateDeckColorIntentSchema
>;
export type GenerateDeckBrief = z.infer<typeof generateDeckBriefSchema>;
export type GenerateDeckPaletteOverride = z.infer<
  typeof generateDeckPaletteOverrideSchema
>;
export type GenerateDeckDesign = z.infer<typeof generateDeckDesignSchema>;
export type GenerateDeckSlideCountRange = z.infer<
  typeof generateDeckSlideCountRangeSchema
>;
export type GenerateDeckRequest = z.infer<typeof generateDeckRequestSchema>;
export type DeckColorOptionRequest = z.infer<typeof deckColorOptionRequestSchema>;
export type DeckColorOption = z.infer<typeof deckColorOptionSchema>;
export type DeckColorOptionsResponse = z.infer<
  typeof deckColorOptionsResponseSchema
>;
export type GenerateDeckValidationIssue = z.infer<
  typeof generateDeckValidationIssueSchema
>;
export type GenerateDeckValidation = z.infer<typeof generateDeckValidationSchema>;
export type TemplateSelectionItem = z.infer<typeof templateSelectionItemSchema>;
export type GenerateDeckResponse = z.infer<typeof generateDeckResponseSchema>;
export type GenerateDeckJobResult = z.infer<typeof generateDeckJobResultSchema>;
