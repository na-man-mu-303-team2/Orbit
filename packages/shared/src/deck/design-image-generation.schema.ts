import { z } from "zod";

import { jobSchema } from "../jobs/job.schema";
import { deckElementIdSchema, deckIdSchema, deckSlideIdSchema } from "./id.schema";

export const designImageAspectRatioSchema = z.enum([
  "landscape",
  "portrait",
  "square",
]);

export const selectedDesignImageReferenceSchema = z.object({
  elementId: deckElementIdSchema,
  fileId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  src: z.string().trim().min(1),
  alt: z.string().trim().max(500).optional(),
});

export const designImageReferenceAttachmentSchema = z.object({
  fileId: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const createDesignImageGenerationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  baseVersion: z.number().int().positive(),
  selectedImageReference: selectedDesignImageReferenceSchema.optional(),
  referenceImages: z
    .array(designImageReferenceAttachmentSchema)
    .max(3)
    .default([]),
});

export const designImageSlideContextSchema = z.object({
  title: z.string().trim().max(500).default(""),
  text: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
  theme: z.object({
    name: z.string().trim().min(1).max(200),
    primaryColor: z.string().trim().min(1).max(100),
    secondaryColor: z.string().trim().min(1).max(100),
    accentColor: z.string().trim().min(1).max(100),
    backgroundColor: z.string().trim().min(1).max(100),
  }),
});

export const designImageGenerationJobPayloadSchema = z.object({
  jobId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  baseVersion: z.number().int().positive(),
  prompt: z.string().trim().min(1).max(2_000),
  aspectRatio: designImageAspectRatioSchema,
  slideContext: designImageSlideContextSchema,
  selectedImageReference: selectedDesignImageReferenceSchema.optional(),
  referenceImages: z
    .array(designImageReferenceAttachmentSchema)
    .max(3)
    .default([]),
});

export const designImageGenerationResultSchema = z.object({
  fileId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  purpose: z.literal("design-asset"),
  url: z.string().trim().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  prompt: z.string().trim().min(1).max(2_000),
  aspectRatio: designImageAspectRatioSchema,
});

export const createDesignImageGenerationResponseSchema = z.object({
  job: jobSchema.refine((job) => job.type === "design-image-generation", {
    message: "job type must be design-image-generation",
  }),
});

export type DesignImageAspectRatio = z.infer<typeof designImageAspectRatioSchema>;
export type DesignImageReferenceAttachment = z.infer<
  typeof designImageReferenceAttachmentSchema
>;
export type CreateDesignImageGenerationRequest = z.infer<
  typeof createDesignImageGenerationRequestSchema
>;
export type SelectedDesignImageReference = z.infer<
  typeof selectedDesignImageReferenceSchema
>;
export type DesignImageSlideContext = z.infer<typeof designImageSlideContextSchema>;
export type DesignImageGenerationJobPayload = z.infer<
  typeof designImageGenerationJobPayloadSchema
>;
export type DesignImageGenerationResult = z.infer<
  typeof designImageGenerationResultSchema
>;
export type CreateDesignImageGenerationResponse = z.infer<
  typeof createDesignImageGenerationResponseSchema
>;
