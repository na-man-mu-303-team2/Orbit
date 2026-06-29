import { z } from "zod";

import { deckSchema } from "./deck.schema";
import { jobSchema } from "../jobs/job.schema";

export const pptxImportRequestSchema = z.object({
  fileId: z.string().min(1)
});

export const pptxImportWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  slideIndex: z.number().int().positive().optional()
});

export const pptxImportResponseSchema = z.object({
  deck: deckSchema,
  warnings: z.array(pptxImportWarningSchema).default([])
});

export const pptxImportJobResultSchema = pptxImportResponseSchema.extend({
  deckId: z.string().min(1)
});

export const pptxImportJobResponseSchema = z.object({
  job: jobSchema
});

export type PptxImportRequest = z.infer<typeof pptxImportRequestSchema>;
export type PptxImportWarning = z.infer<typeof pptxImportWarningSchema>;
export type PptxImportResponse = z.infer<typeof pptxImportResponseSchema>;
export type PptxImportJobResult = z.infer<typeof pptxImportJobResultSchema>;
export type PptxImportJobResponse = z.infer<typeof pptxImportJobResponseSchema>;
