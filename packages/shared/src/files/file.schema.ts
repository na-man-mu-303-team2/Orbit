import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const filePurposeSchema = z.enum([
  "pptx-import",
  "reference-material",
  "rehearsal-audio",
  "export-result",
  "report-result",
  "thumbnail",
]);

export const allowedAssetMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const maxAssetUploadSizeBytes = 50 * 1024 * 1024;

export const uploadedFileSchema = z.object({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().min(1),
  purpose: filePurposeSchema,
  createdAt: isoDateTimeSchema,
});

export const assetUploadUrlRequestSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(allowedAssetMimeTypes),
  size: z.number().int().positive().max(maxAssetUploadSizeBytes),
  purpose: filePurposeSchema,
});

export const assetUploadUrlResponseSchema = z.object({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
  uploadUrl: z.string().url(),
  method: z.literal("PUT"),
  headers: z.record(z.string()),
  expiresAt: isoDateTimeSchema,
  purpose: filePurposeSchema,
});

export const completeAssetUploadRequestSchema = z.object({
  fileId: z.string().min(1),
});

export type FilePurpose = z.infer<typeof filePurposeSchema>;
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export type AssetUploadUrlRequest = z.infer<typeof assetUploadUrlRequestSchema>;
export type AssetUploadUrlResponse = z.infer<
  typeof assetUploadUrlResponseSchema
>;
export type CompleteAssetUploadRequest = z.infer<
  typeof completeAssetUploadRequestSchema
>;
