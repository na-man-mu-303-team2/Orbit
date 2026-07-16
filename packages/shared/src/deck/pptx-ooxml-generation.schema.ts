import { z } from "zod";

import { deckIdSchema } from "./id.schema";
import {
  qualityReportSchema,
  templateBlueprintIdSchema,
} from "./template-blueprint.schema";

export const pptxOoxmlGenerationRequestSchema = z
  .object({
    fileId: z.string().min(1),
  })
  .strict();

export const pptxOoxmlGenerationJobResultSchema = z.object({
  deckId: deckIdSchema,
  templateId: templateBlueprintIdSchema,
  sourceFileId: z.string().min(1),
  currentPackageFileId: z.string().min(1),
  qualityReport: qualityReportSchema,
  warnings: z.array(z.string()).default([]),
});

export const pptxOoxmlSyncJobResultSchema = z.object({
  deckId: deckIdSchema,
  templateId: templateBlueprintIdSchema,
  currentPackageFileId: z.string().min(1),
  renderAssetFileIds: z.array(z.string().min(1)).default([]),
  syncedDeckVersion: z.number().int().positive(),
  warnings: z.array(z.string()).default([]),
});

export type PptxOoxmlGenerationRequest = z.infer<
  typeof pptxOoxmlGenerationRequestSchema
>;
export type PptxOoxmlGenerationJobResult = z.infer<
  typeof pptxOoxmlGenerationJobResultSchema
>;
export type PptxOoxmlSyncJobResult = z.infer<
  typeof pptxOoxmlSyncJobResultSchema
>;
