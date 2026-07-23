import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckSchema } from "./deck.schema";

export const aiDeckPreviewStatusSchema = z.enum([
  "planning",
  "grounding",
  "composing",
  "rendering",
  "quality-check",
  "ready",
  "failed",
  "cancelled",
]);

export const aiDeckPreviewOutlineItemSchema = z
  .object({
    order: z.number().int().positive(),
    title: z.string(),
    message: z.string(),
  })
  .strict();

export const aiDeckPreviewResponseSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    status: aiDeckPreviewStatusSchema,
    progress: z.number().int().min(0).max(100),
    expectedSlideCountRange: z
      .object({
        min: z.number().int().positive(),
        max: z.number().int().positive(),
      })
      .strict()
      .refine((value) => value.min <= value.max, {
        message: "min must be less than or equal to max",
      }),
    editable: z.literal(false),
    outline: z.array(aiDeckPreviewOutlineItemSchema),
    deck: deckSchema.nullable(),
    completedSlideIds: z.array(z.string().trim().min(1)),
    pendingSlideIds: z.array(z.string().trim().min(1)),
    updatedAt: isoDateTimeSchema,
    error: z
      .object({
        code: z.string().trim().min(1),
        message: z.string().trim().min(1).max(240),
        retryable: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type AiDeckPreviewResponse = z.infer<typeof aiDeckPreviewResponseSchema>;
