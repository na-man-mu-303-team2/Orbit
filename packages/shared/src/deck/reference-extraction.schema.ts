import { z } from "zod";

import { jobSchema } from "../jobs/job.schema";

export const referenceExtractionRequestSchema = z
  .object({
    fileIds: z.array(z.string().trim().min(1)).min(1).max(10)
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.fileIds.forEach((fileId, index) => {
      if (seen.has(fileId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileIds", index],
          message: "fileIds must be unique"
        });
      }
      seen.add(fileId);
    });
  });

export const referenceExtractionKeywordSchema = z.object({
  keyword: z.string().trim().min(1),
  reason: z.string().trim().default(""),
  priority: z.string().trim().default("medium")
});

export const referenceExtractionSectionSchema = z.object({
  title: z.string().default(""),
  status: z.string().default(""),
  index: z.number().int().nonnegative().nullable().default(null),
  text: z.string().default(""),
  notes: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({})
});

const referenceExtractionFileInputSchema = z.object({
  projectId: z.string().min(1),
  referenceDocumentId: z.string().min(1),
  fileName: z.string().default(""),
  mimeType: z.string().optional(),
  kind: z.enum(["image", "pdf", "docx", "pptx", "unsupported"]),
  status: z.enum(["succeeded", "skipped", "failed"]),
  message: z.string().default(""),
  rawText: z.string().default(""),
  cleanedText: z.string().default(""),
  cleanupStatus: z.string().default(""),
  cleanupMessage: z.string().default(""),
  keywords: z.array(referenceExtractionKeywordSchema).default([]),
  keywordStatus: z.string().default(""),
  keywordMessage: z.string().default(""),
  indexingStatus: z.string().default(""),
  indexingMessage: z.string().default(""),
  chunkCount: z.number().int().nonnegative().default(0),
  sections: z.array(referenceExtractionSectionSchema).default([]),
  usable: z.boolean().optional()
});

export const referenceExtractionFileSchema = referenceExtractionFileInputSchema.transform(
  (file) => ({
    ...file,
    fileId: file.referenceDocumentId,
    usable:
      file.usable ??
      (file.status === "succeeded" &&
        Boolean(file.cleanedText.trim() || file.rawText.trim()))
  })
);

export const referenceExtractionResultSchema = z.object({
  files: z.array(referenceExtractionFileSchema)
});

export const referenceExtractionStartResponseSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1).max(10),
  job: jobSchema
});

export type ReferenceExtractionRequest = z.infer<
  typeof referenceExtractionRequestSchema
>;
export type ReferenceExtractionFile = z.infer<
  typeof referenceExtractionFileSchema
>;
export type ReferenceExtractionResult = z.infer<
  typeof referenceExtractionResultSchema
>;
export type ReferenceExtractionStartResponse = z.infer<
  typeof referenceExtractionStartResponseSchema
>;
