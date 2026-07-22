import { z } from "zod";

import { jobSchema } from "../jobs/job.schema";
import {
  designAgentCapabilitiesSchema,
  designAgentContextSchema,
  designAgentHistoryItemSchema,
  designAgentMessageSchema,
  designAgentProposalSchema,
} from "./design-agent.schema";
import {
  slideRedesignOutcomeSchema,
  slideRedesignPaletteOptionSchema,
} from "./slide-redesign.schema";

export const slideRedesignStageSchema = z.enum([
  "interpreting",
  "composing",
  "coloring",
  "ornamenting",
  "illustrating",
  "verifying",
]);

export const slideRedesignProgressPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1).max(200),
    stage: slideRedesignStageSchema,
    completedStages: z.array(slideRedesignStageSchema).max(6),
    previewProposal: designAgentProposalSchema.optional(),
  })
  .strict()
  .superRefine((progress, ctx) => {
    const stageOrder = slideRedesignStageSchema.options;
    const currentIndex = stageOrder.indexOf(progress.stage);
    const completedIndexes = progress.completedStages.map((stage) =>
      stageOrder.indexOf(stage),
    );

    if (
      new Set(progress.completedStages).size !== progress.completedStages.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedStages"],
        message: "completedStages must not contain duplicates",
      });
    }
    if (completedIndexes.some((index) => index >= currentIndex)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedStages"],
        message:
          "completedStages must only contain stages before the current stage",
      });
    }
    if (
      completedIndexes.some(
        (index, position) =>
          position > 0 && index <= completedIndexes[position - 1]!,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedStages"],
        message: "completedStages must follow slide redesign stage order",
      });
    }
  });

export const createSlideRedesignJobRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(2_000),
    selectedPaletteOptionId: z.string().trim().min(1),
    context: designAgentContextSchema,
  })
  .strict();

export const slideRedesignJobPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    requestMessageId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(2_000),
    context: designAgentContextSchema,
    history: z.array(designAgentHistoryItemSchema).max(10).default([]),
    capabilities: designAgentCapabilitiesSchema,
    selectedPaletteOption: slideRedesignPaletteOptionSchema,
  })
  .strict();

export const createSlideRedesignJobResponseSchema = z
  .object({
    job: jobSchema.refine((job) => job.type === "slide-redesign", {
      message: "job type must be slide-redesign",
    }),
    requestMessage: designAgentMessageSchema,
  })
  .strict();

export const slideRedesignJobResultSchema = z
  .object({
    outcome: z.union([slideRedesignOutcomeSchema, z.literal("stale")]),
    sessionId: z.string().trim().min(1).max(200),
    requestMessageId: z.string().trim().min(1),
    responseMessageId: z.string().trim().min(1),
    proposal: designAgentProposalSchema.optional(),
    stale: z.boolean(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.outcome === "applicable" && !result.proposal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposal"],
        message: "applicable slide redesign result requires a proposal",
      });
    }
    if (result.outcome === "stale" && !result.stale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stale"],
        message: "stale slide redesign result must set stale=true",
      });
    }
    if (
      result.outcome !== "stale" &&
      result.outcome !== "applicable" &&
      result.stale
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stale"],
        message: "only stale or applicable results may set stale=true",
      });
    }
    if (result.outcome !== "applicable" && result.proposal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposal"],
        message:
          "only applicable slide redesign results may contain a proposal",
      });
    }
    if (
      result.proposal &&
      !["pending", "stale"].includes(result.proposal.status)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposal", "status"],
        message: "slide redesign result proposal must be pending or stale",
      });
    }
    if (
      result.proposal &&
      (result.proposal.status === "stale") !== result.stale
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposal", "status"],
        message: "proposal status must match the result stale flag",
      });
    }
  });

export type SlideRedesignStage = z.infer<typeof slideRedesignStageSchema>;
export type SlideRedesignProgressPayload = z.infer<
  typeof slideRedesignProgressPayloadSchema
>;
export type CreateSlideRedesignJobRequest = z.infer<
  typeof createSlideRedesignJobRequestSchema
>;
export type SlideRedesignJobPayload = z.infer<
  typeof slideRedesignJobPayloadSchema
>;
export type CreateSlideRedesignJobResponse = z.infer<
  typeof createSlideRedesignJobResponseSchema
>;
export type SlideRedesignJobResult = z.infer<
  typeof slideRedesignJobResultSchema
>;
