import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  allowedAssetMimeTypes,
  assetUploadUrlResponseSchema,
  maxAssetUploadSizeBytes
} from "../files/file.schema";
import { jobSchema } from "../jobs/job.schema";

export const rehearsalRunStatusSchema = z.enum([
  "created",
  "uploading",
  "processing",
  "succeeded",
  "failed"
]);

export const rehearsalRunErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export const rehearsalRunSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: z.string().min(1),
  audioFileId: z.string().min(1).nullable(),
  jobId: z.string().min(1).nullable(),
  status: rehearsalRunStatusSchema,
  error: rehearsalRunErrorSchema.nullable(),
  rawAudioDeletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const createRehearsalRunRequestSchema = z.object({
  deckId: z.string().min(1)
});

export const createRehearsalRunResponseSchema = z.object({
  run: rehearsalRunSchema
});

const rehearsalAudioMimeTypes = new Set<string>([
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4"
]);

export const createRehearsalAudioUploadUrlRequestSchema = z
  .object({
    originalName: z.string().trim().min(1).max(255),
    mimeType: z.enum(allowedAssetMimeTypes),
    size: z.number().int().positive().max(maxAssetUploadSizeBytes)
  })
  .superRefine((value, context) => {
    if (!rehearsalAudioMimeTypes.has(value.mimeType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rehearsal audio uploads require an audio MIME type.",
        path: ["mimeType"]
      });
    }
  });

export const createRehearsalAudioUploadUrlResponseSchema = z.object({
  run: rehearsalRunSchema,
  upload: assetUploadUrlResponseSchema
});

export const completeRehearsalAudioUploadRequestSchema = z.object({
  fileId: z.string().min(1)
});

export const completeRehearsalAudioUploadResponseSchema = z.object({
  run: rehearsalRunSchema,
  job: jobSchema
});

export const getRehearsalRunResponseSchema = z.object({
  run: rehearsalRunSchema
});

export type RehearsalRunStatus = z.infer<typeof rehearsalRunStatusSchema>;
export type RehearsalRunError = z.infer<typeof rehearsalRunErrorSchema>;
export type RehearsalRun = z.infer<typeof rehearsalRunSchema>;
export type CreateRehearsalRunRequest = z.infer<
  typeof createRehearsalRunRequestSchema
>;
export type CreateRehearsalRunResponse = z.infer<
  typeof createRehearsalRunResponseSchema
>;
export type CreateRehearsalAudioUploadUrlRequest = z.infer<
  typeof createRehearsalAudioUploadUrlRequestSchema
>;
export type CreateRehearsalAudioUploadUrlResponse = z.infer<
  typeof createRehearsalAudioUploadUrlResponseSchema
>;
export type CompleteRehearsalAudioUploadRequest = z.infer<
  typeof completeRehearsalAudioUploadRequestSchema
>;
export type CompleteRehearsalAudioUploadResponse = z.infer<
  typeof completeRehearsalAudioUploadResponseSchema
>;
