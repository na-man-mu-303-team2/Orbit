import { z } from "zod";

import { jobSchema } from "../jobs/job.schema";
import { semanticCueSchema } from "./semantic-cue.schema";
import { deckIdSchema, deckSlideIdSchema } from "./id.schema";

export const semanticCueExtractionRequestSchema = z
  .object({
    deckId: deckIdSchema.optional(),
    force: z.boolean().default(false)
  })
  .strict();

export const semanticCueExtractionJobPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    request: z
      .object({
        deckId: deckIdSchema,
        force: z.boolean(),
        baseVersion: z.number().int().positive()
      })
      .strict()
  })
  .strict();

export const semanticCueExtractionSlideStatusSchema = z.enum([
  "succeeded",
  "skipped",
  "failed"
]);

export const semanticCueExtractionSlideResultSchema = z
  .object({
    slideId: deckSlideIdSchema,
    status: semanticCueExtractionSlideStatusSchema,
    semanticCues: z.array(semanticCueSchema).default([]),
    warnings: z.array(z.string().trim().min(1).max(160)).default([])
  })
  .strict()
  .superRefine((result, ctx) => {
    result.semanticCues.forEach((cue, index) => {
      if (cue.slideId !== result.slideId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["semanticCues", index, "slideId"],
          message: "semantic cue slideId must match the extraction slide"
        });
      }
    });
  });

export const semanticCueExtractionResultSchema = z
  .object({
    deckId: deckIdSchema,
    sourceDeckVersion: z.number().int().positive(),
    slides: z.array(semanticCueExtractionSlideResultSchema)
  })
  .strict()
  .superRefine((result, ctx) => {
    const slideIds = new Set<string>();
    result.slides.forEach((slide, index) => {
      if (slideIds.has(slide.slideId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", index, "slideId"],
          message: "semantic cue extraction slide IDs must be unique"
        });
      }
      slideIds.add(slide.slideId);
    });
  });

export const createSemanticCueExtractionJobResponseSchema = z
  .object({
    job: jobSchema
  })
  .strict();

export type SemanticCueExtractionRequest = z.infer<
  typeof semanticCueExtractionRequestSchema
>;
export type SemanticCueExtractionJobPayload = z.infer<
  typeof semanticCueExtractionJobPayloadSchema
>;
export type SemanticCueExtractionSlideStatus = z.infer<
  typeof semanticCueExtractionSlideStatusSchema
>;
export type SemanticCueExtractionResult = z.infer<
  typeof semanticCueExtractionResultSchema
>;
export type CreateSemanticCueExtractionJobResponse = z.infer<
  typeof createSemanticCueExtractionJobResponseSchema
>;
