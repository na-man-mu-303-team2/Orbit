import { z } from "zod";

import { deckElementIdSchema, deckIdSchema } from "./id.schema";

export const templateBlueprintIdSchema = z
  .string()
  .regex(/^template_[A-Za-z0-9_-]+$/);

export const templateSlotUsageSchema = z.enum([
  "content-slot",
  "media-slot",
  "fixed-text",
  "decoration",
]);

export const templateSlotRoleSchema = z.enum([
  "title",
  "subtitle",
  "body",
  "caption",
  "image",
  "logo",
  "chart",
  "table",
  "background",
  "unknown",
]);

export const templateSlotReplaceModeSchema = z.enum([
  "replace",
  "preserve",
  "ignore",
]);

export const templateSlotBoundsSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const templateSlotSourceSchema = z
  .object({
    type: z.enum([
      "placeholder",
      "slide",
      "layout",
      "master",
      "table",
      "image",
      "shape",
      "unknown",
    ]),
    name: z.string().min(1).optional(),
    placeholderType: z.string().min(1).optional(),
    slidePart: z.string().min(1).optional(),
    shapeId: z.string().min(1).optional(),
    relationshipId: z.string().min(1).optional(),
  })
  .passthrough();

export const templateElementSourceSchema = z.object({
  elementId: deckElementIdSchema,
  slidePart: z.string().min(1),
  shapeId: z.string().min(1),
  relationshipId: z.string().min(1).optional(),
  sourceType: z.enum([
    "placeholder",
    "slide",
    "layout",
    "master",
    "table",
    "image",
    "shape",
    "unknown",
  ]),
  writable: z.boolean(),
  fallbackReason: z.string().min(1).optional(),
});

export const templateBlueprintSlotSchema = z.object({
  elementId: deckElementIdSchema,
  usage: templateSlotUsageSchema,
  slotRole: templateSlotRoleSchema,
  replaceMode: templateSlotReplaceModeSchema,
  confidence: z.number().finite().min(0).max(1),
  bounds: templateSlotBoundsSchema,
  source: templateSlotSourceSchema,
});

export const templateBlueprintSlideSchema = z.object({
  slideIndex: z.number().int().positive(),
  sourceSlideIndex: z.number().int().positive(),
  renderAssetFileId: z.string().min(1).optional(),
  fallbackRenderAssetFileId: z.string().min(1).optional(),
  elementSources: z.array(templateElementSourceSchema).default([]),
  slots: z.array(templateBlueprintSlotSchema).default([]),
});

export const templateBlueprintSchema = z.object({
  templateId: templateBlueprintIdSchema,
  sourceFileId: z.string().min(1),
  sourcePackageFileId: z.string().min(1).optional(),
  currentPackageFileId: z.string().min(1).optional(),
  ooxmlSyncedDeckVersion: z.number().int().positive().optional(),
  slides: z.array(templateBlueprintSlideSchema).min(1),
});

const qualityScoreSchema = z.number().finite().min(0).max(100);

export const qualityReportSlideStatusSchema = z.enum([
  "passed",
  "vectorization_failed",
  "not_evaluated",
]);

export const qualityReportSlideSchema = z.object({
  slideIndex: z.number().int().positive(),
  status: qualityReportSlideStatusSchema,
  ssim: z.number().finite().min(0).max(1).nullable(),
  reasons: z.array(z.string()).default([]),
  fallback: z.enum(["rendered-background", "none"]).default("none"),
});

export const qualityReportSchema = z.object({
  compositeScore: qualityScoreSchema,
  metrics: z.object({
    geometry: qualityScoreSchema,
    text: qualityScoreSchema,
    color: qualityScoreSchema,
    layer: qualityScoreSchema,
    editability: qualityScoreSchema,
    pixelSimilarity: qualityScoreSchema.nullable(),
  }),
  weights: z.object({
    geometry: z.literal(25),
    text: z.literal(15),
    color: z.literal(10),
    layer: z.literal(10),
    editability: z.literal(10),
    pixelSimilarity: z.literal(30),
  }),
  editabilityCoverage: z.number().finite().min(0).max(1),
  appliedCap: z.number().int().min(0).max(100).nullable().default(null),
  slideReports: z.array(qualityReportSlideSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export const pptxImportJobResultSchema = z.object({
  deckId: deckIdSchema,
  templateId: templateBlueprintIdSchema,
  qualityReport: qualityReportSchema,
  warnings: z.array(z.string()).default([]),
});

export type TemplateBlueprintId = z.infer<typeof templateBlueprintIdSchema>;
export type TemplateSlotUsage = z.infer<typeof templateSlotUsageSchema>;
export type TemplateSlotRole = z.infer<typeof templateSlotRoleSchema>;
export type TemplateSlotReplaceMode = z.infer<
  typeof templateSlotReplaceModeSchema
>;
export type TemplateBlueprintSlot = z.infer<typeof templateBlueprintSlotSchema>;
export type TemplateElementSource = z.infer<typeof templateElementSourceSchema>;
export type TemplateBlueprintSlide = z.infer<
  typeof templateBlueprintSlideSchema
>;
export type TemplateBlueprint = z.infer<typeof templateBlueprintSchema>;
export type QualityReport = z.infer<typeof qualityReportSchema>;
export type QualityReportSlideStatus = z.infer<
  typeof qualityReportSlideStatusSchema
>;
export type QualityReportSlide = z.infer<typeof qualityReportSlideSchema>;
export type PptxImportJobResult = z.infer<typeof pptxImportJobResultSchema>;
