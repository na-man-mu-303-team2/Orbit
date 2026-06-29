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
  "video/mp4",
] as const;

export const maxAssetUploadSizeBytes = 50 * 1024 * 1024;

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
  "video/mp4",
]);

const documentAssetMimeTypes = new Set<string>(
  allowedAssetMimeTypes.filter((mimeType) => !rehearsalAudioMimeTypes.has(mimeType)),
);

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
}).superRefine((value, context) => {
  const isAudio = rehearsalAudioMimeTypes.has(value.mimeType);
  const isDocument = documentAssetMimeTypes.has(value.mimeType);

  if (value.purpose === "rehearsal-audio" && !isAudio) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "rehearsal-audio uploads require an audio MIME type.",
      path: ["mimeType"],
    });
  }

  if (value.purpose !== "rehearsal-audio" && !isDocument) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${value.purpose} uploads do not accept audio MIME types.`,
      path: ["mimeType"],
    });
  }
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
