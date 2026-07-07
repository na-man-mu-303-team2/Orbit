import { z } from "zod";

import {
  generateDeckDesignSchema,
  generateDeckMetadataSchema,
  generateDeckSlideCountRangeSchema,
  generateDeckTemplateSchema,
} from "./generate-deck.schema";
import { deckIdSchema } from "./id.schema";
import {
  qualityReportSchema,
  templateBlueprintIdSchema,
} from "./template-blueprint.schema";

export const aiTemplateDeckAssetRoleSchema = z.enum([
  "content",
  "design",
  "both",
]);

export const aiTemplateDeckAssetSchema = z.object({
  fileId: z.string().min(1),
  role: aiTemplateDeckAssetRoleSchema,
});

export const aiTemplateDeckGenerationRequestSchema = z.object({
  topic: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  designPrompt: z.string().trim().optional(),
  targetDurationMinutes: z.number().int().min(1).max(120).default(10),
  slideCountRange: generateDeckSlideCountRangeSchema,
  template: generateDeckTemplateSchema.default("default"),
  metadata: generateDeckMetadataSchema,
  design: generateDeckDesignSchema,
  assets: z.array(aiTemplateDeckAssetSchema).min(1),
});

export const aiTemplateDeckGenerationJobResultSchema = z.object({
  deckId: deckIdSchema,
  templateId: templateBlueprintIdSchema,
  sourceFileId: z.string().min(1),
  currentPackageFileId: z.string().min(1),
  contentReferenceFileIds: z.array(z.string().min(1)).default([]),
  qualityReport: qualityReportSchema,
  warnings: z.array(z.string()).default([]),
  timings: z.record(z.number().nonnegative()).default({}),
});

export type AiTemplateDeckAssetRole = z.infer<
  typeof aiTemplateDeckAssetRoleSchema
>;
export type AiTemplateDeckAsset = z.infer<typeof aiTemplateDeckAssetSchema>;
export type AiTemplateDeckGenerationRequest = z.infer<
  typeof aiTemplateDeckGenerationRequestSchema
>;
export type AiTemplateDeckGenerationJobResult = z.infer<
  typeof aiTemplateDeckGenerationJobResultSchema
>;
