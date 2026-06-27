import { z } from "zod";

import { jobSchema } from "../jobs/job.schema";

export const referenceExtractKeywordSchema = z.object({
  keyword: z.string().min(1),
  reason: z.string().default(""),
  priority: z.string().default("medium")
});

export const referenceExtractSectionSchema = z.object({
  title: z.string().min(1),
  status: z.string().min(1),
  index: z.number().int().positive().nullable(),
  text: z.string().default(""),
  notes: z.array(z.string()).default([]),
  metadata: z.record(z.union([z.string(), z.number()])).default({})
});

export const referenceExtractFileSchema = z.object({
  projectId: z.string().min(1),
  referenceDocumentId: z.string().min(1).nullable(),
  fileName: z.string().min(1),
  kind: z.string().min(1),
  status: z.string().min(1),
  message: z.string().default(""),
  rawText: z.string().default(""),
  cleanedText: z.string().default(""),
  cleanupStatus: z.string().default(""),
  cleanupMessage: z.string().default(""),
  keywords: z.array(referenceExtractKeywordSchema).default([]),
  keywordStatus: z.string().default(""),
  keywordMessage: z.string().default(""),
  indexingStatus: z.string().default(""),
  indexingMessage: z.string().default(""),
  chunkCount: z.number().int().nonnegative().default(0),
  sections: z.array(referenceExtractSectionSchema).default([])
});

export const referenceExtractWorkerResponseSchema = z.object({
  files: z.array(referenceExtractFileSchema)
});

export const referenceExtractResponseSchema =
  referenceExtractWorkerResponseSchema.extend({
    job: jobSchema
  });

export type ReferenceExtractKeyword = z.infer<
  typeof referenceExtractKeywordSchema
>;
export type ReferenceExtractSection = z.infer<
  typeof referenceExtractSectionSchema
>;
export type ReferenceExtractFile = z.infer<typeof referenceExtractFileSchema>;
export type ReferenceExtractWorkerResponse = z.infer<
  typeof referenceExtractWorkerResponseSchema
>;
export type ReferenceExtractResponse = z.infer<
  typeof referenceExtractResponseSchema
>;
