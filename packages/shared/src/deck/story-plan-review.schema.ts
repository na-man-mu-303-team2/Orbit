import { z } from "zod";

import { aiDeckToneSchema } from "./deck.schema";
import {
  generateDeckFontOverrideSchema,
  generateDeckPaletteOverrideSchema,
  generateDeckRepairReasonSchema,
} from "./generate-deck.schema";
import { jobSchema } from "../jobs/job.schema";

export const storyPlanReviewStatusSchema = z.enum([
  "planning",
  "review-pending",
  "regenerating",
  "approved",
  "failed",
  "cancelled",
]);

export const storyPlanSourceStateSchema = z.enum([
  "connected",
  "attention",
  "none",
]);

export const storyPlanSourceMetadataSchema = z
  .object({
    title: z.string().trim().min(1),
    type: z.enum(["topic", "uploaded", "web", "generated", "none"]),
    authority: z.enum(["official", "independent", "unknown"]),
  })
  .strict();

export const storyPlanSlideSchema = z
  .object({
    order: z.number().int().min(1),
    slideType: z.string().trim().min(1),
    title: z.string(),
    message: z.string(),
    speakerNotes: z.string(),
    targetSeconds: z.number().int().nonnegative(),
    sourceState: storyPlanSourceStateSchema,
    sources: z.array(storyPlanSourceMetadataSchema),
  })
  .strict();

export const storyPlanQualityWarningSchema = z
  .object({
    code: z.enum(["RESEARCH_PARTIAL", "RESEARCH_UNAVAILABLE", "AUTO_REPAIRED"]),
    message: z.string().trim().min(1).max(240),
  })
  .strict();

export const storyPlanSchema = z
  .object({
    revision: z.number().int().min(1),
    regenerationCount: z.number().int().min(0).max(5),
    regenerationLimit: z.literal(5),
    outline: z
      .object({
        title: z.string(),
        slideTitles: z.array(z.string()),
      })
      .strict(),
    totalSeconds: z.number().int().nonnegative(),
    slideCount: z.number().int().min(1),
    generatedAt: z.string().datetime(),
    qualityWarnings: z.array(storyPlanQualityWarningSchema),
    repairReasonCodes: z.array(generateDeckRepairReasonSchema),
    slides: z.array(storyPlanSlideSchema).min(1),
  })
  .strict();

export const storyPlanReviewErrorSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1).max(240),
  })
  .strict();

export const storyPlanReviewResponseSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    status: storyPlanReviewStatusSchema,
    styleContext: z
      .object({
        topic: z.string().trim().min(1),
        tone: aiDeckToneSchema,
      })
      .strict()
      .nullable(),
    plan: storyPlanSchema.nullable(),
    error: storyPlanReviewErrorSchema.nullable(),
  })
  .strict();

export const storyPlanRegenerateRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    instruction: z.string().trim().max(240).optional(),
  })
  .strict();

export const storyPlanApproveRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    designSelection: z
      .object({
        paletteOptionId: z.string().trim().min(1).max(80),
        paletteOverride: generateDeckPaletteOverrideSchema.required(),
        fontOverride: generateDeckFontOverrideSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const storyPlanSlideOrderSchema = z
  .array(z.number().int().min(1))
  .min(1)
  .max(100)
  .refine((orders) => new Set(orders).size === orders.length, {
    message: "Slide orders must be unique",
  });

export const storyPlanEditRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("reorder"),
      expectedRevision: z.number().int().min(1),
      orders: storyPlanSlideOrderSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("speaker-notes"),
      expectedRevision: z.number().int().min(1),
      order: z.number().int().min(1),
      speakerNotes: z.string().trim().min(1).max(5000),
    })
    .strict(),
]);

export const generateDeckStartResponseSchema = z
  .object({
    job: jobSchema,
    storyReviewRequired: z.boolean(),
  })
  .strict();

export type StoryPlanReviewResponse = z.infer<
  typeof storyPlanReviewResponseSchema
>;
export type StoryPlanRegenerateRequest = z.infer<
  typeof storyPlanRegenerateRequestSchema
>;
export type StoryPlanApproveRequest = z.infer<
  typeof storyPlanApproveRequestSchema
>;
export type StoryPlanEditRequest = z.infer<
  typeof storyPlanEditRequestSchema
>;
