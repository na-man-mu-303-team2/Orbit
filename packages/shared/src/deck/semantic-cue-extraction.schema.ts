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

export const semanticCueExtractionSlideResultSchema = z
  .object({
    slideId: deckSlideIdSchema,
    semanticCues: z.array(semanticCueSchema).default([])
  })
  .strict();

export const semanticCueExtractionResultSchema = z
  .object({
    deckId: deckIdSchema,
    slides: z.array(semanticCueExtractionSlideResultSchema).default([])
  })
  .strict();

export const createSemanticCueExtractionJobResponseSchema = z
  .object({
    job: jobSchema
  })
  .strict();

export type SemanticCueExtractionRequest = z.infer<
  typeof semanticCueExtractionRequestSchema
>;
export type SemanticCueExtractionResult = z.infer<
  typeof semanticCueExtractionResultSchema
>;
export type CreateSemanticCueExtractionJobResponse = z.infer<
  typeof createSemanticCueExtractionJobResponseSchema
>;
