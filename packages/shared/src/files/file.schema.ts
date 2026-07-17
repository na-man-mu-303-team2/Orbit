import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { defaultRehearsalAudioMaxBytes } from "../config/runtime";

export const filePurposeSchema = z.enum([
  "pptx-import",
  "reference-material",
  "rehearsal-audio",
  "rehearsal-transcript-json",
  "rehearsal-transcript-text",
  "focused-practice-audio",
  "qna-answer-audio",
  "export-result",
  "report-result",
  "thumbnail",
  "rehearsal-slide-snapshot",
  "design-asset",
]);

export const privateAudioPurposeSchema = z.enum([
  "rehearsal-audio",
  "focused-practice-audio",
  "qna-answer-audio",
]);
export const privateAudioPurposes = new Set<string>(privateAudioPurposeSchema.options);

export const rehearsalTranscriptPurposeSchema = z.enum([
  "rehearsal-transcript-json",
  "rehearsal-transcript-text",
]);
export const rehearsalTranscriptPurposes = new Set<string>(
  rehearsalTranscriptPurposeSchema.options,
);
export const ownerOnlyFilePurposes = new Set<string>([
  ...privateAudioPurposeSchema.options,
  ...rehearsalTranscriptPurposeSchema.options,
]);

export const allowedAssetMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/markdown",
  "audio/mp3",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/flac",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
] as const;

export const maxAssetUploadSizeBytes = 50 * 1024 * 1024;
export const maxRehearsalAudioUploadSizeBytes = defaultRehearsalAudioMaxBytes;

export const allowedRehearsalAudioMimeTypes = [
  "audio/mp3",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/flac",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
] as const;

const rehearsalAudioMimeTypes = new Set<string>(allowedRehearsalAudioMimeTypes);

const documentAssetMimeTypes = new Set<string>(
  allowedAssetMimeTypes.filter((mimeType) => !rehearsalAudioMimeTypes.has(mimeType)),
);

export interface AssetUploadUrlRequestSchemaOptions {
  maxRehearsalAudioUploadSizeBytes?: number;
  allowedPrivatePurpose?: z.infer<typeof privateAudioPurposeSchema>;
}

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

const assetUploadUrlRequestBaseSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(allowedAssetMimeTypes),
  size: z.number().int().positive(),
  purpose: filePurposeSchema,
});

export function createAssetUploadUrlRequestSchema(
  options: AssetUploadUrlRequestSchemaOptions = {},
) {
  // 리허설 녹음 한도는 배포 환경별 env 설정을 따르므로 schema 생성 시 주입한다.
  const rehearsalAudioMaxBytes =
    options.maxRehearsalAudioUploadSizeBytes === undefined
      ? maxRehearsalAudioUploadSizeBytes
      : Math.min(
          options.maxRehearsalAudioUploadSizeBytes,
          maxRehearsalAudioUploadSizeBytes,
        );

  return assetUploadUrlRequestBaseSchema.superRefine((value, context) => {
    const isAudio = rehearsalAudioMimeTypes.has(value.mimeType);
    const isDocument = documentAssetMimeTypes.has(value.mimeType);

    if (value.purpose === "design-asset") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "design-asset is reserved for internal derived assets.",
        path: ["purpose"],
      });
    }

    if (
      privateAudioPurposes.has(value.purpose) &&
      value.purpose !== options.allowedPrivatePurpose
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.purpose} is reserved for a dedicated private audio command.`,
        path: ["purpose"],
      });
    }

    if (rehearsalTranscriptPurposes.has(value.purpose)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.purpose} is reserved for internal rehearsal transcript artifacts.`,
        path: ["purpose"],
      });
    }

    if (privateAudioPurposes.has(value.purpose) && !isAudio) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rehearsal-audio 업로드는 지원하는 오디오 MIME type이어야 합니다.",
        path: ["mimeType"],
      });
    }

    if (privateAudioPurposes.has(value.purpose) && value.size > rehearsalAudioMaxBytes) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: rehearsalAudioMaxBytes,
        inclusive: true,
        type: "number",
        message: "rehearsal-audio 업로드는 설정된 최대 크기 이하여야 합니다.",
        path: ["size"],
      });
    }

    if (!privateAudioPurposes.has(value.purpose) && !isDocument) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.purpose} uploads do not accept audio MIME types.`,
        path: ["mimeType"],
      });
    }

    if (!privateAudioPurposes.has(value.purpose) && value.size > maxAssetUploadSizeBytes) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: maxAssetUploadSizeBytes,
        inclusive: true,
        type: "number",
        message: "파일 업로드는 50MiB 이하여야 합니다.",
        path: ["size"],
      });
    }
  });
}

export const assetUploadUrlRequestSchema = createAssetUploadUrlRequestSchema();

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
export type RehearsalTranscriptPurpose = z.infer<
  typeof rehearsalTranscriptPurposeSchema
>;
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export type AssetUploadUrlRequest = z.infer<typeof assetUploadUrlRequestSchema>;
export type AssetUploadUrlResponse = z.infer<
  typeof assetUploadUrlResponseSchema
>;
export type CompleteAssetUploadRequest = z.infer<
  typeof completeAssetUploadRequestSchema
>;
